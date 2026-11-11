"""Small authoritative domain operations shared by HTTP, supervisor and tests."""

import hashlib
import json
import re

from django.core.exceptions import ValidationError
from django.db import connection, transaction
from django.utils import timezone

from .geometry import validate_geometry
from .media import frame_index
from .models import (
    Camera,
    ClipJob,
    Configuration,
    CoverageGap,
    FixtureEvent,
    FrameJob,
    ProcessingRun,
    Review,
    Transition,
)
from .provenance import versions
from .storage import pin

STATES = [
    "NO_EVENT",
    "INTERACTION_CANDIDATE",
    "RELEASE_CANDIDATE",
    "LANDING_CANDIDATE",
    "STABILIZED",
    "RETRIEVAL_WINDOW",
    "CONFIRMATION_CHECK",
]
TERMINAL = {"WOULD_ALERT", "UNCERTAIN", "REJECTED", "INCOMPLETE"}


def text(value, maximum=200):
    if (
        not isinstance(value, str)
        or not 1 <= len(value.strip()) <= maximum
        or any(ord(c) < 32 for c in value)
    ):
        raise ValidationError("Invalid text value")
    return value.strip()


def source_time(value):
    if type(value) is not int or not 0 <= value <= 10**15:
        raise ValidationError(
            "Source time must be nonnegative integer microseconds within an epoch"
        )
    return value


@transaction.atomic
def create_camera(name, kind, secret_ref, permission_ref, data_provenance=None):
    # Serialize the small two-camera admission rule across simultaneous requests.
    with connection.cursor() as cursor:
        cursor.execute("SELECT pg_advisory_xact_lock(740101)")
    if Camera.objects.count() >= 2:
        raise ValidationError("M01 is limited to two source identities")
    if kind not in {"rtsp", "file_fixture"} or not re.fullmatch(r"[a-zA-Z0-9_-]{1,80}", secret_ref):
        raise ValidationError("Use a supported source kind and protected runtime reference")
    provenance = data_provenance or ("synthetic" if kind == "file_fixture" else "unclassified")
    if provenance not in {"synthetic", "staged_real", "natural", "unclassified"} or (
        kind == "file_fixture" and provenance != "synthetic"
    ):
        raise ValidationError("Source provenance must be explicit; file fixtures stay synthetic")
    return Camera.objects.create(
        name=text(name, 120),
        kind=kind,
        secret_ref=secret_ref,
        permission_ref=text(permission_ref),
        data_provenance=provenance,
    )


@transaction.atomic
def edit_camera(camera, values):
    camera = Camera.objects.select_for_update().get(pk=camera.pk)
    if not values or set(values) - {"name", "secret_ref", "permission_ref"}:
        raise ValidationError("Edit name, protected secret_ref or permission_ref only")
    if any(
        key in values and values[key] != getattr(camera, key)
        for key in ("secret_ref", "permission_ref")
    ) and (camera.desired_recording or camera.sessions.filter(stopped_at=None).exists()):
        raise ValidationError(
            "Stop and await recording shutdown before changing a source reference"
        )
    for key, value in values.items():
        if key == "secret_ref" and (
            not isinstance(value, str) or not re.fullmatch(r"[a-zA-Z0-9_-]{1,80}", value)
        ):
            raise ValidationError("Invalid protected runtime reference")
        setattr(
            camera, key, text(value, 80 if key == "secret_ref" else 120 if key == "name" else 200)
        )
    camera.save(update_fields=list(values))
    return camera


@transaction.atomic
def configure(camera, geometry, settings):
    camera = Camera.objects.select_for_update().get(pk=camera.pk)
    validate_geometry(geometry)
    if not isinstance(settings, dict) or set(settings) - {"segment_seconds", "retention_seconds"}:
        raise ValidationError("Unknown M01 capture settings")
    segment = settings.get("segment_seconds", 2)
    retention = settings.get("retention_seconds", 3600)
    if (
        type(segment) is not int
        or not 1 <= segment <= 10
        or type(retention) is not int
        or not 120 <= retention <= 86400
    ):
        raise ValidationError("Capture segment must be 1-10s and rolling retention 120-86400s")
    settings = {"segment_seconds": segment, "retention_seconds": retention}
    digest = hashlib.sha256(
        json.dumps(
            {"geometry": geometry, "settings": settings}, sort_keys=True, allow_nan=False
        ).encode()
    ).hexdigest()
    current = camera.active_revision
    active = camera.sessions.filter(stopped_at=None).first()
    watermark = {"session": str(active.id), "health": active.health} if active else {}
    revision = Configuration.objects.create(
        camera=camera,
        sequence=(current.sequence + 1 if current else 1),
        geometry=geometry,
        settings=settings,
        digest=digest,
        activated_at=timezone.now(),
        activation_watermark=watermark,
    )
    camera.active_revision = revision
    camera.save(update_fields=["active_revision"])
    return revision


def recording(camera, desired):
    camera = Camera.objects.get(pk=camera.pk)
    if type(desired) is not bool or (desired and not camera.active_revision_id):
        raise ValidationError("A validated configuration is required before recording")
    Camera.objects.filter(pk=camera.pk).update(desired_recording=desired)


@transaction.atomic
def replay(session, mode="media_replay"):
    if mode not in {"media_replay", "observation_fixture"}:
        raise ValidationError("No model/inference mode is available in M01")
    segments = []
    for epoch in session.epochs.order_by("sequence"):
        for segment in epoch.segments.select_related("artifact"):
            segments.append(
                {
                    "id": str(segment.id),
                    "epoch": str(epoch.id),
                    "start_us": segment.start_us,
                    "end_us": segment.end_us,
                    "sha256": segment.artifact.sha256,
                }
            )
            if segment.artifact.status == "available":
                pin(segment.artifact, "replay-input", 3600)
    if not segments:
        raise ValidationError("No catalogued source segments to replay")
    configuration = session.configuration
    return ProcessingRun.objects.create(
        session=session,
        configuration=configuration,
        mode=mode,
        input_manifest={
            "session": str(session.id),
            "segments": segments,
            "gaps": [
                {
                    "id": str(gap.id),
                    "epoch_id": str(gap.epoch_id) if gap.epoch_id else None,
                    "start_us": gap.start_us,
                    "end_us": gap.end_us,
                    "reason": gap.reason,
                    "created_at": gap.created_at.isoformat(),
                    "ended_at": gap.ended_at.isoformat() if gap.ended_at else None,
                }
                for gap in session.gaps.all()
            ],
            "clock": "epoch_source_microseconds_not_wall_time",
        },
        versions={**versions(), "configuration_sha256": configuration.digest},
    )


@transaction.atomic
def create_fixture(run, epoch, release_key, release_us):
    if run.mode != "observation_fixture" or epoch.session_id != run.session_id:
        raise ValidationError(
            "Fixture events require a conspicuous fixture run on this source session"
        )
    event, created = FixtureEvent.objects.get_or_create(
        run=run,
        release_key=text(release_key, 100),
        defaults={"epoch": epoch, "release_us": source_time(release_us)},
    )
    if not created and (event.epoch_id != epoch.id or event.release_us != release_us):
        raise ValidationError("Idempotency key already has different fixture content")
    return event


@transaction.atomic
def transition(event, sequence, state, source_us, reason, evidence):
    event = FixtureEvent.objects.select_for_update().get(pk=event.pk)
    source_time(source_us)
    if (
        type(sequence) is not int
        or not isinstance(evidence, dict)
        or len(json.dumps(evidence)) > 8192
    ):
        raise ValidationError("Invalid fixture transition")
    reason = text(reason, 100)
    prior = event.transitions.filter(sequence=sequence).first()
    if prior:
        if (prior.state, prior.source_us, prior.reason, prior.evidence) == (
            state,
            source_us,
            reason,
            evidence,
        ):
            return prior
        raise ValidationError("Transition retry conflicts with committed history")
    last = event.transitions.last()
    previous = last.state if last else "NO_EVENT"
    expected = (last.sequence + 1) if last else 1
    if sequence != expected or previous in TERMINAL or source_us < (last.source_us if last else 0):
        raise ValidationError("Transition order or source time is invalid")
    if state == "AUTOMATIC_ALERT" or state not in set(STATES) | TERMINAL:
        raise ValidationError("Production activation is disabled")
    if state not in TERMINAL and STATES.index(state) != STATES.index(previous) + 1:
        raise ValidationError("Fixture history must not skip unobserved stages")
    if state == "WOULD_ALERT":
        raise ValidationError(
            "M01 fixtures cannot claim real evidence gates or experimental detector positives"
        )
    return Transition.objects.create(
        event=event,
        sequence=sequence,
        previous=previous,
        state=state,
        source_us=source_us,
        reason=reason,
        evidence=evidence,
        processing_at=timezone.now(),
    )


@transaction.atomic
def review(event, state, reason, notes, reviewer_label, supersedes=None):
    FixtureEvent.objects.select_for_update().get(pk=event.pk)
    if (
        state not in {"new", "under_review", "confirmed", "rejected", "needs_better_footage"}
        or not isinstance(notes, str)
        or len(notes) > 4000
    ):
        raise ValidationError("Invalid review action")
    if supersedes and supersedes.event_id != event.id:
        raise ValidationError("Correction must reference this event")
    return Review.objects.create(
        event=event,
        state=state,
        reason=text(reason, 100),
        notes=notes,
        reviewer_label=text(reviewer_label, 100),
        supersedes=supersedes,
    )


def admit_media_job():
    with connection.cursor() as cursor:
        cursor.execute("SELECT pg_advisory_xact_lock(740102)")
    count = (
        ClipJob.objects.filter(status__in=["queued", "running"]).count()
        + FrameJob.objects.filter(status__in=["queued", "running"]).count()
    )
    if count >= 16:
        raise ValidationError("Bounded media queue is full; retry after existing jobs complete")


@transaction.atomic
def request_frame(segment, requested_us):
    source_time(requested_us)
    frame_index(segment, requested_us)
    admit_media_job()
    pin(segment.artifact, "frame-inspection", 120)
    return FrameJob.objects.create(segment=segment, requested_us=requested_us)


@transaction.atomic
def request_clip(event, required_start_us, required_end_us):
    admit_media_job()
    event = FixtureEvent.objects.select_for_update().get(pk=event.pk)
    start, end = source_time(required_start_us), source_time(required_end_us)
    if not start <= event.release_us < end or end - start > 300_000_000:
        raise ValidationError(
            "Required interval must contain release and be bounded to five minutes"
        )
    requested_start = min(start, event.release_us - 15_000_000)
    requested_end = max(end, event.release_us + 45_000_000)
    last = event.clips.order_by("revision").last()
    job = ClipJob.objects.create(
        event=event,
        revision=(last.revision + 1 if last else 1),
        start_us=requested_start,
        end_us=requested_end,
        required_start_us=start,
        required_end_us=end,
    )
    for segment in event.epoch.segments.select_related("artifact").filter(
        end_us__gt=requested_start, start_us__lt=requested_end
    ):
        if segment.artifact.status == "available":
            pin(segment.artifact, "active-event-evidence", 3600)
    return job


def interrupt_epoch(epoch, reason, source_us):
    for event in FixtureEvent.objects.filter(epoch=epoch):
        with transaction.atomic():
            event = FixtureEvent.objects.select_for_update().get(pk=event.pk)
            last = event.transitions.last()
            if not last or last.state not in TERMINAL:
                position = max(source_us or 0, last.source_us if last else event.release_us)
                transition(
                    event, last.sequence + 1 if last else 1, "INCOMPLETE", position, reason, {}
                )


def interrupt_sessions(reason="restart_coverage_unverified"):
    from .models import CaptureSession
    from .processes import reap_registered

    for session in CaptureSession.objects.filter(stopped_at=None):
        reaped = reap_registered(session.child_identity)
        if not reaped:
            # Unknown/reused/missing generation is not authority to kill or auto-resume.
            Camera.objects.filter(pk=session.camera_id).update(desired_recording=False)
        with transaction.atomic():
            CoverageGap.objects.create(session=session, reason=reason, ended_at=timezone.now())
            session.status = "interrupted"
            session.stopped_at = timezone.now()
            session.health = {
                "transport": "unknown",
                "recording": "incomplete",
                "processing": "not_implemented",
                "reason": reason,
            }
            session.save(update_fields=["status", "stopped_at", "health"])
            for event in FixtureEvent.objects.filter(run__session=session):
                last = event.transitions.last()
                if not last or last.state not in TERMINAL:
                    transition(
                        event,
                        (last.sequence + 1 if last else 1),
                        "INCOMPLETE",
                        last.source_us if last else event.release_us,
                        reason,
                        {},
                    )
    ClipJob.objects.filter(status="running").update(
        status="failed", coverage={"reason": "restart_media_publication_unverified"}
    )
    FrameJob.objects.filter(status="running").update(
        status="failed", reason="restart_frame_publication_unverified"
    )
