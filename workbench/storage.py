"""Private classified media with bounded retention and explicit missing status."""

import hashlib
import os
import shutil
import stat
import uuid
from datetime import timedelta
from pathlib import Path

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from litterwatch.runtime import runtime_root

from .models import Artifact, EvidencePin


class StoragePressure(Exception):
    pass


def media_root():
    root = runtime_root() / "media"
    root.mkdir(parents=True, mode=0o700, exist_ok=True)
    if root.is_symlink() or root.stat().st_mode & 0o077:
        raise StoragePressure("Private media directory required")
    return root


def artifact_path(artifact):
    root = media_root().resolve()
    path = root / artifact.relative_path
    if path.parent.resolve() != root or path.is_symlink() or path.resolve().parent != root:
        raise ValidationError("Invalid catalogued media reference")
    return path


def budget(additional=0):
    root = media_root()
    # Include unregistered staging/temporary data, not only DB accounting.
    used = sum(p.stat().st_size for p in root.rglob("*") if p.is_file() and not p.is_symlink())
    quota = int(os.environ.get("LITTERING_QUOTA_BYTES", str(10 * 1024**3)))
    reserve = int(os.environ.get("LITTERING_RESERVE_BYTES", str(256 * 1024**2)))
    if used + additional > quota or shutil.disk_usage(root).free - additional < reserve:
        raise StoragePressure("Storage budget exceeded; retained evidence preserved")
    return used


def publish(path, classification, mime, lineage=(), metadata=None, ttl_seconds=3600):
    """Validate in media module first; rename then catalog, never overwrite a prior ID.

    A crash between rename/catalog leaves an orphan. Recovery quarantines it; it is
    not silently reinterpreted as validated evidence.
    """
    path = Path(path)
    if not stat.S_ISREG(path.lstat().st_mode) or path.is_symlink():
        raise ValidationError("Regular media file required")
    budget()  # staging bytes already included
    identity = uuid.uuid4()
    suffix = {"video/mp2t": ".ts", "video/mp4": ".mp4", "image/jpeg": ".jpg"}[mime]
    target = media_root() / (str(identity) + suffix)
    with path.open("rb") as stream:
        digest = hashlib.file_digest(stream, "sha256").hexdigest()
    os.chmod(path, 0o600)
    os.replace(path, target)
    return Artifact.objects.create(
        id=identity,
        classification=classification,
        relative_path=target.name,
        mime=mime,
        byte_size=target.stat().st_size,
        sha256=digest,
        lineage=list(lineage),
        metadata=metadata or {},
        expires_at=timezone.now() + timedelta(seconds=ttl_seconds),
    )


@transaction.atomic
def pin(artifact, purpose, seconds):
    if (
        not isinstance(seconds, int)
        or not 1 <= seconds <= 7 * 86400
        or not purpose
        or len(purpose) > 100
    ):
        raise ValidationError("A pin needs purpose and bounded expiry (up to seven days)")
    artifact = Artifact.objects.select_for_update().get(pk=artifact.pk)
    if artifact.status != "available":
        raise ValidationError("Unavailable evidence cannot be pinned")
    if EvidencePin.objects.filter(released_at=None, expires_at__gt=timezone.now()).count() >= 1000:
        raise StoragePressure("Evidence pin limit reached")
    return EvidencePin.objects.create(
        artifact=artifact, purpose=purpose, expires_at=timezone.now() + timedelta(seconds=seconds)
    )


def sweep():
    """Delete only expired unpinned bytes. Failed/unrecorded deletion is retriable."""
    count = 0
    for identity in Artifact.objects.filter(
        status="available", expires_at__lte=timezone.now()
    ).values_list("id", flat=True)[:200]:
        with transaction.atomic():
            artifact = Artifact.objects.select_for_update().get(pk=identity)
            if artifact.pins.filter(released_at=None, expires_at__gt=timezone.now()).exists():
                continue
            artifact_path(artifact).unlink(missing_ok=True)
            artifact.status = "deleted"
            artifact.deleted_at = timezone.now()
            artifact.save(update_fields=["status", "deleted_at"])
            count += 1
    return count


def reconcile():
    """Recover truthful availability. Orphans stay private; never delete pinned bytes."""
    for artifact in Artifact.objects.filter(status="available").iterator(chunk_size=100):
        path = artifact_path(artifact)
        if not path.exists() or path.stat().st_size != artifact.byte_size:
            Artifact.objects.filter(pk=artifact.pk).update(status="missing")
