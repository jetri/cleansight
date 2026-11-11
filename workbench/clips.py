"""Clip jobs preserve available spans separately, never splice a gap into continuity."""

from django.core.exceptions import ValidationError
from django.utils import timezone

from .media import MediaFailure, render_span, snapshot, validate_video
from .models import Artifact, ClipJob, FrameJob
from .storage import StoragePressure, publish, verified_path


def assemble_frame(job):
    if not FrameJob.objects.filter(pk=job.pk, status="queued").update(status="running"):
        return
    path = None
    try:
        path, source_us = snapshot(job.segment, job.requested_us)
        job.artifact = publish(
            path,
            "frame_unredacted",
            "image/jpeg",
            lineage=[str(job.segment.artifact_id)],
            metadata={
                "source_us": source_us,
                "epoch": str(job.segment.epoch_id),
                "redacted": False,
            },
            ttl_seconds=120,
        )
        job.status = "available"
    except (ValidationError, MediaFailure, StoragePressure, OSError):
        job.status = "failed"
        job.reason = "frame_or_storage_failure"
    finally:
        if path:
            path.unlink(missing_ok=True)
        job.save(update_fields=["artifact", "status", "reason"])


def coverage(segments, start, end, excluded=()):
    spans = []
    for segment in segments:
        pieces = [[max(start, segment.start_us), min(end, segment.end_us)]]
        for gap_start, gap_end in [*segment.index.get("missing_spans", []), *excluded]:
            split = []
            for a, b in pieces:
                if a < min(b, gap_start):
                    split.append([a, min(b, gap_start)])
                if max(a, gap_end) < b:
                    split.append([max(a, gap_end), b])
            pieces = split
        spans.extend([a, b] for a, b in pieces if b > a)
    available = []
    for a, b in sorted(spans):
        if available and a <= available[-1][1]:
            available[-1][1] = max(b, available[-1][1])
        else:
            available.append([a, b])
    missing = []
    cursor = start
    for a, b in available:
        if a > cursor:
            missing.append([cursor, a])
        cursor = max(cursor, b)
    if cursor < end:
        missing.append([cursor, end])
    return available, missing


def assemble(job):
    if not ClipJob.objects.filter(pk=job.pk, status="queued").update(status="running"):
        return
    job.refresh_from_db()
    segments, bad = [], []
    try:
        for segment in job.event.epoch.segments.select_related("artifact").filter(
            end_us__gt=job.start_us, start_us__lt=job.end_us
        ):
            artifact = segment.artifact
            try:
                if artifact.status != "available":
                    raise MediaFailure("source_unavailable")
                validate_video(verified_path(artifact))
                segments.append(segment)
            except (OSError, MediaFailure):
                Artifact.objects.filter(pk=artifact.pk).update(status="missing")
                bad.append(str(segment.id))
        gaps = list(
            job.event.epoch.session.gaps.filter(
                epoch=job.event.epoch, start_us__isnull=False, end_us__isnull=False
            ).values_list("start_us", "end_us")
        )
        available, missing = coverage(segments, job.start_us, job.end_us, gaps)
        _, required_missing = coverage(segments, job.required_start_us, job.required_end_us, gaps)
        emitted = []
        for start, end in available:
            subset = [s for s in segments if s.start_us < end and s.end_us > start]
            path, index = render_span(subset, start, end)
            try:
                artifact = publish(
                    path,
                    "derived_unredacted",
                    "video/mp4",
                    lineage=[str(s.artifact_id) for s in subset],
                    metadata={
                        "epoch": str(job.event.epoch_id),
                        "source_span_us": [start, end],
                        "index": index,
                        "redacted": False,
                        "fixture": True,
                    },
                )
                job.artifacts.add(artifact)
                emitted.append(str(artifact.id))
            finally:
                path.unlink(missing_ok=True)
        job.coverage = {
            "requested": [job.start_us, job.end_us],
            "required": [job.required_start_us, job.required_end_us],
            "available": available,
            "missing": missing,
            "required_missing": required_missing,
            "corrupt_or_unavailable_segments": bad,
            "parts": emitted,
            "published_at": timezone.now().isoformat(),
            "reason": "media_missing_or_corrupt"
            if missing or bad
            else "complete_recorded_coverage_not_visual_evidence",
        }
        job.status = "partial" if missing else "available"
    except (MediaFailure, StoragePressure, OSError):
        job.status = "failed"
        job.coverage = {
            "reason": "clip_or_storage_failure",
            "requested": [job.start_us, job.end_us],
            "required": [job.required_start_us, job.required_end_us],
        }
    finally:
        job.save(update_fields=["coverage", "status"])
