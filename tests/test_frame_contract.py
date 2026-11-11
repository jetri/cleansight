import http.cookiejar
import json
import urllib.error
import urllib.request

import pytest
from django.core.exceptions import ValidationError
from django.test import Client

from workbench.capture import preview
from workbench.clips import assemble_frame
from workbench.media import snapshot
from workbench.models import Artifact, EvidencePin, FrameJob
from workbench.storage import artifact_path

from .test_backend_e2e import running_backend, wait_until


@pytest.mark.django_db(transaction=True)
def test_socket_frame_requests_resolve_only_at_or_after(captured, private_runtime):
    _, _, epoch = captured
    first = epoch.segments.get(start_us=0)
    later = epoch.segments.get(start_us=20_000_000)
    assert first.end_us == 2_000_000
    assert first.index["frame_us"][-1] == 1_900_000
    assert later.end_us == 22_000_000
    assert later.index["frame_us"][-1] == 21_900_000
    client = urllib.request.build_opener(
        urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar())
    )
    token = None
    with running_backend(private_runtime) as (_, base, _):

        def call(path, data=None):
            request = urllib.request.Request(
                base + path,
                data=json.dumps(data).encode() if data is not None else None,
                headers={
                    "Content-Type": "application/json",
                    **({"X-CSRFToken": token} if token else {}),
                },
            )
            try:
                with client.open(request, timeout=8) as result:
                    return result.status, json.loads(result.read())["data"]
            except urllib.error.HTTPError as error:
                return error.code, json.loads(error.read())["data"]

        token = wait_until(lambda: call("/api/health"))[1]["csrf_token"]
        jobs, pins = FrameJob.objects.count(), EvidencePin.objects.count()
        for segment, positions in [
            (first, [-1, 1_900_001, 1_950_000, 1_999_999, 2_000_000]),
            (later, [21_900_001, 21_950_000, 21_999_999, 22_000_000]),
        ]:
            for requested in positions:
                status, result = call(
                    f"/api/segments/{segment.id}/frames", {"source_us": requested}
                )
                assert status == 400 and result["error"] == "invalid_request"
        assert FrameJob.objects.count() == jobs
        assert EvidencePin.objects.count() == pins

        for segment, requested, expected in [
            (first, 0, 0),
            (first, 1_850_000, 1_900_000),
            (first, 1_900_000, 1_900_000),
            (later, 20_030_000, 20_100_000),
            (later, 21_900_000, 21_900_000),
        ]:
            status, job = call(f"/api/segments/{segment.id}/frames", {"source_us": requested})
            assert status == 202

            def ready(job_id=job["id"]):
                status, result = call(f"/api/frames/{job_id}")
                assert status == 200
                return result if result["status"] in {"available", "failed"} else None

            resolved = wait_until(ready)
            assert resolved["status"] == "available"
            assert resolved["source_us"] == expected
            assert resolved["source_us"] >= requested
            with client.open(base + "/media/" + resolved["media"], timeout=8) as result:
                assert result.status == 200
                assert result.read().startswith(b"\xff\xd8")


@pytest.mark.django_db
def test_tail_snapshot_and_legacy_queued_jobs_cannot_publish(captured, private_runtime):
    _, _, epoch = captured
    artifacts = Artifact.objects.count()
    images = set((private_runtime / "media").rglob("*.jpg"))
    for start, requested in [(0, 1_950_000), (20_000_000, 21_950_000)]:
        segment = epoch.segments.get(start_us=start)
        with pytest.raises(ValidationError):
            snapshot(segment, requested)
        job = FrameJob.objects.create(segment=segment, requested_us=requested)
        assemble_frame(job)
        job.refresh_from_db()
        assert job.status == "failed"
        assert job.artifact_id is None
        result = Client(HTTP_HOST="127.0.0.1").get(f"/api/frames/{job.id}")
        assert result.status_code == 200
        assert result.json()["data"]["status"] == "failed"
        assert result.json()["data"]["media"] is None
        assert result.json()["data"]["source_us"] is None
    assert Artifact.objects.count() == artifacts
    assert set((private_runtime / "media").rglob("*.jpg")) == images


@pytest.mark.django_db(transaction=True)
def test_preview_preserves_exact_last_indexed_frame(captured):
    _, _, epoch = captured
    for start, expected in [(0, 1_900_000), (20_000_000, 21_900_000)]:
        segment = epoch.segments.get(start_us=start)
        result = preview(segment)
        assert result["source_us"] == expected
        assert result["epoch"] == str(epoch.id)
        artifact = Artifact.objects.get(pk=result["artifact"])
        assert artifact.metadata["source_us"] == expected
        assert artifact_path(artifact).read_bytes().startswith(b"\xff\xd8")


@pytest.mark.django_db
def test_legacy_backward_frame_readback_does_not_advertise_available_media(captured):
    _, _, epoch = captured
    segment = epoch.segments.get(start_us=0)
    exact = FrameJob.objects.create(segment=segment, requested_us=1_900_000)
    assemble_frame(exact)
    exact.refresh_from_db()
    assert exact.status == "available"
    client = Client(HTTP_HOST="127.0.0.1")
    normal = client.get(f"/api/frames/{exact.id}")
    assert normal.status_code == 200
    assert normal.json()["data"]["source_us"] == 1_900_000
    legacy = FrameJob.objects.create(
        segment=segment, requested_us=1_950_000, status="available", artifact=exact.artifact
    )
    result = client.get(f"/api/frames/{legacy.id}")
    assert result.status_code == 400
    assert result.json()["data"]["error"] == "invalid_request"
    assert "media" not in result.json()["data"]
