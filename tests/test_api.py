import json
from datetime import timedelta

import pytest
from django.test import Client
from django.utils import timezone

from workbench import services
from workbench.capture import Supervisor
from workbench.models import Artifact, CaptureSession, ClipJob
from workbench.storage import artifact_path, pin, publish

from .conftest import GEOMETRY


@pytest.mark.django_db
def test_persistent_queue_and_config_api(fixture_event):
    event = fixture_event
    client = Client(HTTP_HOST="127.0.0.1", enforce_csrf_checks=True)
    token = client.get("/api/health").json()["data"]["csrf_token"]
    headers = {"HTTP_X_CSRFTOKEN": token}
    camera = event.run.session.camera
    result = client.post(
        f"/api/cameras/{camera.id}",
        data=json.dumps({"name": "renamed source"}),
        content_type="application/json",
        **headers,
    )
    assert result.status_code == 200 and result.json()["data"]["name"] == "renamed source"
    assert client.get(f"/api/runs?session={event.run.session_id}").json()["data"][0]["id"] == str(
        event.run_id
    )
    assert client.get("/api/events?phase=provisional").json()["data"][0]["id"] == str(event.id)
    services.transition(event, 1, "INCOMPLETE", event.release_us, "fixture gap", {})
    assert client.get("/api/events?phase=provisional").json()["data"] == []
    queued = client.get(
        f"/api/events?camera={camera.id}&outcome=INCOMPLETE&reason=fixture%20gap"
    ).json()["data"]
    assert len(queued) == 1 and queued[0]["phase"] == "final"
    assert client.get("/api/events?phase=invalid").status_code == 400
    assert client.get("/api/cameras", REMOTE_ADDR="192.0.2.2").status_code == 403
    assert client.get("/api/cameras", HTTP_HOST="external.invalid").status_code == 400
    assert (
        client.post("/api/cameras", data="{}", content_type="application/json").status_code == 403
    )
    assert (
        client.post(
            "/api/cameras",
            data=json.dumps({"url": "rtsp://accidental:canary@host/x"}),
            content_type="application/json",
            **headers,
        ).status_code
        == 400
    )
    assert "accidental:canary" not in client.get("/api/cameras").content.decode()
    old_revision = event.run.configuration
    services.configure(camera, GEOMETRY, {"segment_seconds": 4})
    assert event.run.configuration_id == old_revision.id


@pytest.mark.django_db(transaction=True)
def test_controlled_storage_failure_stops_capture_preserves_retained_evidence(
    private_runtime, monkeypatch
):
    file = private_runtime / "media" / "fixture.jpg"
    file.write_bytes(b"synthetic preserved evidence")
    artifact = publish(file, "frame_unredacted", "image/jpeg")
    pin(artifact, "retained evaluation fixture", 3600)
    Artifact.objects.filter(pk=artifact.pk).update(expires_at=timezone.now() - timedelta(seconds=1))
    camera = services.create_camera(
        "synthetic source",
        "file_fixture",
        "not-resolved-on-storage-failure",
        "synthetic permission",
    )
    services.configure(camera, GEOMETRY, {})
    camera.refresh_from_db()
    services.recording(camera, True)
    monkeypatch.setenv("LITTERING_QUOTA_BYTES", "1")  # Controlled fault, never fill real disk.
    supervisor = Supervisor()
    try:
        supervisor.tick()
    finally:
        supervisor.stop()
    camera.refresh_from_db()
    assert camera.desired_recording is False
    session = CaptureSession.objects.get(camera=camera)
    assert session.health["reason"] == "source_or_storage_failure"
    assert session.gaps.exists()
    assert artifact_path(artifact).exists()


@pytest.mark.django_db
def test_media_recovery_fails_unverified_jobs_without_duplicate_retry(fixture_event):
    event = fixture_event
    job = services.request_clip(event, 0, 40_000_000)
    ClipJob.objects.filter(pk=job.pk).update(status="running")
    services.interrupt_sessions()
    job.refresh_from_db()
    assert (
        job.status == "failed" and job.coverage["reason"] == "restart_media_publication_unverified"
    )
    assert event.transitions.last().state == "INCOMPLETE"
    assert event.clips.count() == 1
