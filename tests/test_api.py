import json
from datetime import timedelta

import pytest
from django.test import Client
from django.utils import timezone

from workbench import services
from workbench.capture import Supervisor
from workbench.models import Artifact, CaptureSession, ClipJob, CoverageGap, Epoch, ProcessingRun
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


@pytest.mark.django_db
@pytest.mark.parametrize("desired", [False, True])
def test_active_session_identity_edit_preserves_protected_references(fixture_event, desired):
    """The identity form promises name edits while both references remain locked."""
    camera = fixture_event.run.session.camera
    services.recording(camera, desired)
    client = Client(HTTP_HOST="127.0.0.1", enforce_csrf_checks=True)
    token = client.get("/api/health").json()["data"]["csrf_token"]
    values = {
        "name": "Renamed during capture",
        "secret_ref": camera.secret_ref,
        "permission_ref": camera.permission_ref,
    }

    def edit(payload):
        return client.post(
            f"/api/cameras/{camera.id}",
            data=json.dumps(payload),
            content_type="application/json",
            HTTP_X_CSRFTOKEN=token,
        )

    # Unchanged disabled fields sent by the normal UI are not reference changes.
    result = edit(values)
    assert result.status_code == 200
    assert result.json()["data"]["name"] == values["name"]
    for field in ["secret_ref", "permission_ref"]:
        assert edit({**values, "name": "Must not persist", field: "changed-reference"}).status_code == 400
        camera.refresh_from_db()
        assert camera.name == values["name"]
        assert getattr(camera, field) == values[field]
    # Recording OFF still locks references until the active session has ended.
    services.recording(camera, False)
    assert edit({"secret_ref": "changed-reference"}).status_code == 400
    session = fixture_event.run.session
    session.stopped_at = timezone.now()
    session.save(update_fields=["stopped_at"])
    assert edit({"secret_ref": "changed-reference", "permission_ref": "changed-permission"}).status_code == 200


@pytest.mark.django_db
@pytest.mark.parametrize("mode", ["media_replay", "observation_fixture"])
def test_replay_uses_recorded_configuration_after_camera_reconfiguration(captured, mode):
    """Walkthrough A4 requires replay of the original session configuration."""
    camera, session, _ = captured
    client = Client(HTTP_HOST="127.0.0.1")

    def create_run():
        result = client.post(
            f"/api/sessions/{session.id}/replays",
            data=json.dumps({"mode": mode}),
            content_type="application/json",
        )
        assert result.status_code == 201
        return result.json()["data"]

    original = create_run()
    newer = services.configure(camera, GEOMETRY, {"segment_seconds": 3})
    replayed = create_run()
    assert replayed["id"] != original["id"]
    assert replayed["configuration"] == original["configuration"] == str(session.configuration_id)
    assert replayed["versions"]["configuration_sha256"] == session.configuration.digest
    assert replayed["input_manifest"] == original["input_manifest"]
    for run in client.get(f"/api/runs?session={session.id}").json()["data"]:
        assert run["configuration_id"] == str(session.configuration_id)
    session.refresh_from_db()
    camera.refresh_from_db()
    assert camera.active_revision_id == newer.id != session.configuration_id
    assert ProcessingRun.objects.get(pk=original["id"]).configuration_id == session.configuration_id


@pytest.mark.django_db
def test_queue_filters_use_serialized_outcome_without_transitions(fixture_event):
    event = fixture_event
    final = services.create_fixture(event.run, event.epoch, "final-sibling", 0)
    services.transition(final, 1, "INCOMPLETE", 0, "synthetic_gap", {})
    client = Client(HTTP_HOST="127.0.0.1")
    scope = f"camera={event.run.session.camera_id}&run={event.run_id}"

    def queued(filters):
        result = client.get(f"/api/events?{scope}&{filters}")
        assert result.status_code == 200
        return result.json()["data"]

    for filters in ["outcome=NO_EVENT", "outcome=NO_EVENT&phase=provisional", "phase=provisional"]:
        records = queued(filters)
        assert [record["id"] for record in records] == [str(event.id)]
        assert records[0]["machine_outcome"] == "NO_EVENT"
        assert records[0]["phase"] == "provisional"
        assert records[0]["transitions"] == []
    assert queued("outcome=NO_EVENT&phase=final") == []
    assert [record["id"] for record in queued("phase=final")] == [str(final.id)]
    services.transition(event, 1, "INTERACTION_CANDIDATE", 0, "synthetic_candidate", {})
    assert queued("outcome=NO_EVENT") == []
    assert [
        record["id"]
        for record in queued(
            "outcome=INTERACTION_CANDIDATE&phase=provisional&reason=synthetic_candidate"
        )
    ] == [str(event.id)]
    assert [
        record["id"] for record in queued("outcome=INCOMPLETE&phase=final&reason=synthetic_gap")
    ] == [str(final.id)]


@pytest.mark.django_db
@pytest.mark.parametrize("mode", ["media_replay", "observation_fixture"])
def test_replay_freezes_gap_identity_epoch_and_host_clocks(captured, mode):
    _, session, epoch = captured
    reconnect = Epoch.objects.create(
        session=session, sequence=2, reason="synthetic_reconnect", arrival_anchor=timezone.now()
    )
    closed = timezone.now()
    gaps = [
        CoverageGap.objects.create(
            session=session,
            epoch=identity,
            start_us=100_000,
            end_us=200_000,
            reason="synthetic_gap",
            ended_at=closed,
        )
        for identity in [epoch, reconnect]
    ]
    gaps.append(CoverageGap.objects.create(session=session, reason="synthetic_open_outage"))
    client = Client(HTTP_HOST="127.0.0.1")
    result = client.post(
        f"/api/sessions/{session.id}/replays",
        data=json.dumps({"mode": mode}),
        content_type="application/json",
    )
    assert result.status_code == 201
    created = result.json()["data"]
    persisted = ProcessingRun.objects.get(pk=created["id"])
    expected = {
        str(gap.id): {
            "id": str(gap.id),
            "epoch_id": str(gap.epoch_id) if gap.epoch_id else None,
            "start_us": gap.start_us,
            "end_us": gap.end_us,
            "reason": gap.reason,
            "created_at": gap.created_at.isoformat(),
            "ended_at": gap.ended_at.isoformat() if gap.ended_at else None,
        }
        for gap in gaps
    }
    assert {gap["id"]: gap for gap in created["input_manifest"]["gaps"]} == expected
    assert persisted.input_manifest == created["input_manifest"]
    CoverageGap.objects.create(session=session, epoch=reconnect, reason="later_gap")
    for cursor in ["", "?segment=1&frame=0"]:
        readback = client.get(f"/api/runs/{persisted.id}/timeline{cursor}").json()["data"]
        assert {gap["id"]: gap for gap in readback["gaps"]} == expected
    assert session.gaps.count() == 4


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
