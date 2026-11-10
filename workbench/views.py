"""Backend JSON resource contracts only. No product templates, styling or frontend."""

import asyncio
import functools
import json
import os
import re
from datetime import datetime

from django.core.exceptions import ObjectDoesNotExist, ValidationError
from django.db import DatabaseError, IntegrityError
from django.db.models import OuterRef, Q, Subquery
from django.http import HttpResponse, JsonResponse, StreamingHttpResponse
from django.middleware.csrf import get_token
from django.utils import timezone

from . import services
from .media import MediaFailure
from .models import (
    Artifact,
    Camera,
    CaptureSession,
    ClipJob,
    Epoch,
    FixtureEvent,
    FrameJob,
    ProcessingRun,
    Review,
    Segment,
    Transition,
)
from .storage import StoragePressure, artifact_path, pin

WARNINGS = [
    "LOCAL DEVELOPMENT",
    "UNVALIDATED",
    "UNREDACTED FOOTAGE",
    "FIXTURES ARE NOT MODEL OR ACCURACY EVIDENCE",
    "NO PRODUCTION SECURITY",
]


def response(data, status=200):
    return JsonResponse(
        {"data": data, "warnings": WARNINGS, "production_activation": "disabled"}, status=status
    )


def endpoint(methods):
    def decorate(function):
        @functools.wraps(function)
        def handler(request, **kwargs):
            if request.method not in methods:
                result = response({"error": "method_not_allowed"}, 405)
                result["Allow"] = ", ".join(methods)
                return result
            try:
                data = json.loads(request.body) if request.method == "POST" else {}
                if not isinstance(data, dict):
                    raise ValidationError("JSON object required")
                return function(request, data, **kwargs)
            except ObjectDoesNotExist:
                return response({"error": "not_found"}, 404)
            except ValidationError as error:
                # Messages are application-owned; never include resolved secrets or SQL.
                return response({"error": "invalid_request", "reasons": error.messages}, 400)
            except (ValueError, KeyError, TypeError, json.JSONDecodeError):
                return response({"error": "invalid_request"}, 400)
            except IntegrityError:
                return response({"error": "conflict"}, 409)
            except DatabaseError:
                return response({"error": "database_unavailable"}, 503)
            except (MediaFailure, StoragePressure, OSError):
                return response({"error": "media_or_storage_unavailable"}, 503)

        return handler

    return decorate


def camera_data(camera):
    return {
        "id": str(camera.id),
        "name": camera.name,
        "kind": camera.kind,
        "secret_ref": camera.secret_ref,
        "permission_ref": camera.permission_ref,
        "data_provenance": camera.data_provenance,
        "desired_recording": camera.desired_recording,
        "active_revision": str(camera.active_revision_id) if camera.active_revision_id else None,
    }


def revision_data(revision):
    return {
        "id": str(revision.id),
        "sequence": revision.sequence,
        "geometry": revision.geometry,
        "settings": revision.settings,
        "digest": revision.digest,
        "activated_at": revision.activated_at,
        "activation_watermark": revision.activation_watermark,
    }


def session_data(session):
    from litterwatch.asgi import supervisor

    health = dict(session.health)
    if session.stopped_at is None and supervisor and supervisor.error:
        health.update(transport="unknown", recording="unverified", reason=supervisor.error)
    preview = health.get("preview")
    if isinstance(preview, dict) and preview.get("source_observed_at"):
        age = max(
            0,
            (
                timezone.now() - datetime.fromisoformat(preview["source_observed_at"])
            ).total_seconds(),
        )
        health["preview"] = {
            **preview,
            "source_age_seconds": age,
            "age_basis": "sealed_recording_host_mtime_not_camera_utc",
            "stale": age > 8
            or session.stopped_at is not None
            or health.get("transport") != "connected",
            "note": "near-live sealed-source preview, network clock uncertainty retained",
        }
    return {
        "id": str(session.id),
        "camera": str(session.camera_id),
        "configuration": str(session.configuration_id),
        "provenance": session.provenance,
        "status": session.status,
        "started_at": session.created_at,
        "stopped_at": session.stopped_at,
        "health": health,
        "epochs": list(
            session.epochs.order_by("sequence").values(
                "id", "sequence", "reason", "arrival_anchor", "mapping"
            )
        ),
        "gaps": list(
            session.gaps.values(
                "id", "epoch_id", "start_us", "end_us", "reason", "created_at", "ended_at"
            )
        ),
    }


def clip_data(job):
    return {
        "id": str(job.id),
        "revision": job.revision,
        "status": job.status,
        "requested": [job.start_us, job.end_us],
        "required": [job.required_start_us, job.required_end_us],
        "coverage": job.coverage,
        "media": [str(x) for x in job.artifacts.values_list("id", flat=True)],
    }


def event_data(event):
    transitions = list(
        event.transitions.values(
            "id",
            "sequence",
            "previous",
            "state",
            "source_us",
            "reason",
            "evidence",
            "provenance",
            "processing_at",
            "created_at",
        )
    )
    return {
        "id": str(event.id),
        "run": str(event.run_id),
        "configuration": str(event.run.configuration_id),
        "epoch": str(event.epoch_id),
        "release_us": event.release_us,
        "label": event.label,
        "phase": "final"
        if transitions and transitions[-1]["state"] in services.TERMINAL
        else "provisional",
        "machine_outcome": transitions[-1]["state"] if transitions else "NO_EVENT",
        "transitions": transitions,
        "reviews": list(
            event.reviews.values(
                "id", "state", "reason", "notes", "reviewer_label", "supersedes_id", "created_at"
            )
        ),
        "clips": [clip_data(c) for c in event.clips.order_by("revision")],
    }


@endpoint(["GET"])
def health(request, data):
    from litterwatch.asgi import supervisor

    return response(
        {
            "status": "degraded" if supervisor and supervisor.error else "local_workbench",
            "supervisor": supervisor.error if supervisor else "not_running",
            "csrf_token": get_token(request),
            "sources": Camera.objects.count(),
            "ui": "django_shell",
            "detector": "not_implemented",
        }
    )


@endpoint(["GET", "POST"])
def cameras(request, data):
    if request.method == "GET":
        return response([camera_data(c) for c in Camera.objects.order_by("created_at")])
    if set(data) - {"data_provenance"} != {"name", "kind", "secret_ref", "permission_ref"}:
        raise ValidationError(
            "Camera accepts name, kind, secret_ref and permission_ref only; no embedded URL/credentials"
        )
    return response(camera_data(services.create_camera(**data)), 201)


@endpoint(["GET", "POST"])
def camera_detail(request, data, identity):
    camera = Camera.objects.get(pk=identity)
    if request.method == "POST":
        camera = services.edit_camera(camera, data)
    return response(camera_data(camera))


@endpoint(["GET"])
def artifact_detail(request, data, identity):
    artifact = Artifact.objects.get(pk=identity)
    return response(
        {
            "id": str(artifact.id),
            "classification": artifact.classification,
            "status": artifact.status,
            "mime": artifact.mime,
            "byte_size": artifact.byte_size,
            "sha256": artifact.sha256,
            "lineage": artifact.lineage,
            "metadata": artifact.metadata,
            "expires_at": artifact.expires_at,
            "pins": list(artifact.pins.values("id", "purpose", "expires_at", "released_at")),
        }
    )


@endpoint(["GET", "POST"])
def configurations(request, data, identity):
    camera = Camera.objects.get(pk=identity)
    if request.method == "GET":
        return response([revision_data(r) for r in camera.revisions.order_by("sequence")])
    return response(
        revision_data(services.configure(camera, data["geometry"], data.get("settings", {}))), 201
    )


@endpoint(["POST"])
def recording(request, data, identity):
    camera = Camera.objects.get(pk=identity)
    services.recording(camera, data["enabled"])
    camera.refresh_from_db()
    return response(camera_data(camera), 202)


@endpoint(["GET"])
def sessions(request, data):
    query = CaptureSession.objects.order_by("-created_at")
    if request.GET.get("camera"):
        query = query.filter(camera_id=request.GET["camera"])
    return response([session_data(s) for s in query[:100]])


@endpoint(["GET"])
def session_detail(request, data, identity):
    session = CaptureSession.objects.get(pk=identity)
    result = session_data(session)
    result["segments"] = list(
        Segment.objects.filter(epoch__session=session)
        .order_by("epoch__sequence", "start_us")
        .values("id", "epoch_id", "start_us", "end_us", "artifact_id", "artifact__status")
    )
    return response(result)


@endpoint(["POST"])
def replays(request, data, identity):
    run = services.replay(CaptureSession.objects.get(pk=identity), data.get("mode", "media_replay"))
    return response(
        {
            "id": str(run.id),
            "mode": run.mode,
            "input_manifest": run.input_manifest,
            "configuration": str(run.configuration_id),
            "versions": run.versions,
        },
        201,
    )


@endpoint(["GET"])
def runs(request, data):
    query = ProcessingRun.objects.order_by("-created_at")
    if request.GET.get("session"):
        query = query.filter(session_id=request.GET["session"])
    return response(
        list(
            query.values("id", "session_id", "configuration_id", "mode", "created_at", "versions")[
                :100
            ]
        )
    )


@endpoint(["GET"])
def event_queue(request, data):
    latest = Transition.objects.filter(event_id=OuterRef("pk")).order_by("-sequence")
    query = (
        FixtureEvent.objects.select_related("run")
        .annotate(latest_state=Subquery(latest.values("state")[:1]))
        .order_by("-created_at")
    )
    if request.GET.get("camera"):
        query = query.filter(run__session__camera_id=request.GET["camera"])
    if request.GET.get("run"):
        query = query.filter(run_id=request.GET["run"])
    if request.GET.get("outcome"):
        query = query.filter(latest_state=request.GET["outcome"])
    if request.GET.get("reason"):
        query = query.filter(transitions__reason=request.GET["reason"]).distinct()
    if request.GET.get("phase") == "final":
        query = query.filter(latest_state__in=services.TERMINAL)
    elif request.GET.get("phase") == "provisional":
        query = query.filter(Q(latest_state__isnull=True) | ~Q(latest_state__in=services.TERMINAL))
    elif request.GET.get("phase"):
        raise ValidationError("Phase must be provisional or final")
    return response([event_data(event) for event in query[:100]])


@endpoint(["GET"])
def timeline(request, data, identity):
    from .models import Segment

    run = ProcessingRun.objects.get(pk=identity)
    segment_position = int(request.GET.get("segment", 0))
    frame_position = int(request.GET.get("frame", 0))
    manifest = run.input_manifest["segments"]
    if not 0 <= segment_position <= len(manifest) or frame_position < 0:
        raise ValidationError("Invalid replay cursor")
    result = []
    while segment_position < len(manifest) and len(result) < 256:
        entry = manifest[segment_position]
        segment = Segment.objects.select_related("artifact").get(pk=entry["id"])
        if segment.artifact.status != "available":
            result.append(
                {
                    "epoch": entry["epoch"],
                    "segment": entry["id"],
                    "unavailable": segment.artifact.status,
                    "span": [entry["start_us"], entry["end_us"]],
                }
            )
            segment_position += 1
            frame_position = 0
            continue
        index = segment.index
        if frame_position > len(index["frame_us"]):
            raise ValidationError("Invalid replay frame cursor")
        while frame_position < len(index["frame_us"]) and len(result) < 256:
            result.append(
                {
                    "epoch": entry["epoch"],
                    "segment": entry["id"],
                    "frame": frame_position,
                    "source_us": index["frame_us"][frame_position],
                    "raw_pts": index["raw_pts"][frame_position],
                    "time_base": index["time_base"],
                }
            )
            frame_position += 1
        if frame_position == len(index["frame_us"]):
            segment_position += 1
            frame_position = 0
    return response(
        {
            "run": str(run.id),
            "mode": run.mode,
            "frames": result,
            "next": {"segment": segment_position, "frame": frame_position}
            if segment_position < len(manifest)
            else None,
            "clock": "epoch_source_microseconds_not_wall_time",
            "gaps": run.input_manifest["gaps"],
        }
    )


@endpoint(["GET", "POST"])
def events(request, data, identity):
    run = ProcessingRun.objects.get(pk=identity)
    if request.method == "GET":
        return response([event_data(e) for e in run.events.order_by("created_at")[:100]])
    return response(
        event_data(
            services.create_fixture(
                run, Epoch.objects.get(pk=data["epoch"]), data["release_key"], data["release_us"]
            )
        ),
        201,
    )


@endpoint(["GET"])
def event_detail(request, data, identity):
    return response(event_data(FixtureEvent.objects.get(pk=identity)))


@endpoint(["POST"])
def transitions(request, data, identity):
    event = FixtureEvent.objects.get(pk=identity)
    services.transition(
        event,
        data["sequence"],
        data["state"],
        data["source_us"],
        data["reason"],
        data.get("evidence", {}),
    )
    return response(event_data(event), 201)


@endpoint(["POST"])
def reviews(request, data, identity):
    event = FixtureEvent.objects.get(pk=identity)
    services.review(
        event,
        data["state"],
        data["reason"],
        data.get("notes", ""),
        data["reviewer_label"],
        Review.objects.get(pk=data["supersedes"]) if data.get("supersedes") else None,
    )
    return response(event_data(event), 201)


@endpoint(["POST"])
def clips(request, data, identity):
    job = services.request_clip(
        FixtureEvent.objects.get(pk=identity), data["required_start_us"], data["required_end_us"]
    )
    return response(clip_data(job), 202)


@endpoint(["GET"])
def clip_detail(request, data, identity):
    return response(clip_data(ClipJob.objects.get(pk=identity)))


@endpoint(["POST"])
def pins(request, data, identity):
    result = pin(
        Artifact.objects.get(pk=identity), services.text(data["purpose"], 100), data["seconds"]
    )
    return response({"id": str(result.id), "expires_at": result.expires_at}, 201)


@endpoint(["POST"])
def frames(request, data, identity):
    from .models import Segment

    segment = Segment.objects.select_related("artifact").get(pk=identity)
    job = services.request_frame(segment, data["source_us"])
    return response({"id": str(job.id), "status": job.status}, 202)


@endpoint(["GET"])
def frame_detail(request, data, identity):
    job = FrameJob.objects.select_related("artifact").get(pk=identity)
    return response(
        {
            "id": str(job.id),
            "status": job.status,
            "reason": job.reason,
            "media": str(job.artifact_id) if job.artifact_id else None,
            "source_us": job.artifact.metadata.get("source_us") if job.artifact_id else None,
        }
    )


def csrf_failure(request, reason=""):
    return response({"error": "csrf_rejected"}, 403)


def parse_range(value, size):
    if not value:
        return 0, size - 1, False
    match = re.fullmatch(r"bytes=(\d*)-(\d*)", value)
    if not match or not any(match.groups()):
        raise ValueError
    first, last = match.groups()
    if not first:
        count = int(last)
        if count <= 0:
            raise ValueError
        start, end = max(0, size - count), size - 1
    else:
        start, end = int(first), min(int(last) if last else size - 1, size - 1)
    if start >= size or end < start:
        raise ValueError
    return start, end, True


class BoundedReader:
    def __init__(self, fd, start, length):
        self.file = os.fdopen(fd, "rb")
        self.start = start
        self.length = length

    async def __aiter__(self):
        try:
            await asyncio.to_thread(self.file.seek, self.start)
            remaining = self.length
            while remaining:
                block = await asyncio.to_thread(self.file.read, min(64 * 1024, remaining))
                if not block:
                    break
                remaining -= len(block)
                yield block
        finally:
            self.close()

    def close(self):
        self.file.close()  # Idempotent, including a response closed before iteration.


@endpoint(["GET", "HEAD"])
def media(request, data, identity):
    artifact = Artifact.objects.get(pk=identity)
    if artifact.status != "available":
        return response({"error": "media_unavailable", "status": artifact.status}, 410)
    path = artifact_path(artifact)
    try:
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    except OSError:
        Artifact.objects.filter(pk=artifact.pk).update(status="missing")
        return response({"error": "media_missing"}, 410)
    size = os.fstat(fd).st_size
    if size != artifact.byte_size or not size:
        os.close(fd)
        Artifact.objects.filter(pk=artifact.pk).update(status="missing")
        return response({"error": "media_changed"}, 410)
    try:
        start, end, partial = parse_range(request.headers.get("Range"), size)
    except ValueError:
        os.close(fd)
        result = HttpResponse(status=416)
        result["Content-Range"] = f"bytes */{size}"
        return result
    if request.method == "HEAD":
        os.close(fd)
        result = HttpResponse(content_type=artifact.mime, status=206 if partial else 200)
    else:
        result = StreamingHttpResponse(
            BoundedReader(fd, start, end - start + 1),
            content_type=artifact.mime,
            status=206 if partial else 200,
        )
    result["Content-Length"] = str(end - start + 1)
    result["Accept-Ranges"] = "bytes"
    result["Content-Disposition"] = f'inline; filename="{artifact.id}{path.suffix}"'
    if partial:
        result["Content-Range"] = f"bytes {start}-{end}/{size}"
    return result
