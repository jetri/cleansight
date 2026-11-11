"""Synthetic regression for strict input rejection and bounded RTSP recovery.

The accepted recording contract requires gaps and separate epochs, never a
preview or continuous coverage from a rejected segment. No camera is used.
"""
import time

import pytest
from django.core.exceptions import ImproperlyConfigured

from tests.conftest import GEOMETRY
from workbench import capture, services
from workbench.media import MediaFailure
from workbench.models import Camera, CoverageGap, Segment
from workbench.storage import StoragePressure, artifact_path


@pytest.fixture
def recorder_supervisor(transactional_db, synthetic, monkeypatch):
    camera = services.create_camera("Generated source", "rtsp", "source_a", "synthetic")
    services.configure(camera, GEOMETRY, {})
    Camera.objects.filter(pk=camera.pk).update(desired_recording=True)
    # Feed the real recorder a generated, looping encoded file instead of a camera.
    monkeypatch.setattr(capture, "input_arguments", lambda _: ["-re", "-stream_loop", "-1", "-i", str(synthetic)])
    supervisor = capture.Supervisor()
    try:
        yield supervisor, camera
    finally:
        supervisor.stop()


def tick_until(supervisor, condition, seconds=15):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        supervisor.tick()
        if condition():
            return
        time.sleep(0.1)
    pytest.fail("recorder did not reach the expected state before its deadline")


def reject_first(monkeypatch):
    strict = capture.validate_video
    rejected = []

    def validate(path, max_seconds=360):
        if not rejected:
            rejected.append((path, path.read_bytes()))
            raise MediaFailure("strict_decode_failed")
        return strict(path, max_seconds=max_seconds)

    monkeypatch.setattr(capture, "validate_video", validate)
    return rejected


def test_rejected_input_recovers_in_fresh_epoch_without_false_continuity(recorder_supervisor, monkeypatch):
    supervisor, camera = recorder_supervisor
    rejected = reject_first(monkeypatch)
    tick_until(supervisor, lambda: bool(rejected))
    bad_path, bad_bytes = rejected[0]
    assert bad_bytes and bad_path.read_bytes() == bad_bytes
    assert not Segment.objects.exists()
    camera.refresh_from_db()
    assert camera.desired_recording, "strict input rejection must enter bounded recovery"
    recorder = supervisor.recorders[str(camera.pk)]
    first_epoch = recorder.epoch
    assert CoverageGap.objects.filter(session=recorder.session, epoch=first_epoch).exists()
    assert recorder.process is None or recorder.process.poll() is not None
    recorder.retry_at = 0
    tick_until(supervisor, lambda: Segment.objects.exists())
    segment = Segment.objects.get()
    assert segment.epoch_id != first_epoch.id
    assert segment.epoch.sequence > first_epoch.sequence
    assert segment.start_us == 0
    assert artifact_path(segment.artifact).read_bytes() != bad_bytes
    tick_until(supervisor, lambda: isinstance(recorder.session.health.get("preview"), dict))
    assert recorder.session.health["preview"].get("epoch") == str(segment.epoch_id)


def test_desired_off_during_recovery_reaps_child(recorder_supervisor, monkeypatch):
    supervisor, camera = recorder_supervisor
    rejected = reject_first(monkeypatch)
    supervisor.tick()
    recorder = supervisor.recorders[str(camera.pk)]
    child = recorder.process
    assert recorder.session.child_identity["pid"] == child.pid
    tick_until(supervisor, lambda: bool(rejected))
    camera.refresh_from_db()
    assert camera.desired_recording
    Camera.objects.filter(pk=camera.pk).update(desired_recording=False)
    supervisor.tick()
    recorder.session.refresh_from_db()
    assert recorder.session.status == "stopped"
    assert child.poll() is not None
    assert str(camera.pk) not in supervisor.recorders
    assert not Segment.objects.exists()


def test_repeated_bad_input_exhausts_existing_retry_limit(recorder_supervisor, monkeypatch):
    supervisor, camera = recorder_supervisor
    failures = []

    def reject(path, max_seconds=360):
        failures.append(path.read_bytes())
        raise MediaFailure("strict_decode_failed")

    monkeypatch.setattr(capture, "validate_video", reject)
    supervisor.tick()
    recorder = supervisor.recorders[str(camera.pk)]
    for attempt in range(1, 6):
        tick_until(supervisor, lambda: len(failures) >= attempt)
        camera.refresh_from_db()
        if attempt < 5:
            assert camera.desired_recording
            assert str(camera.pk) in supervisor.recorders
            recorder.retry_at = 0
        else:
            assert not camera.desired_recording
    assert not Segment.objects.exists()
    assert recorder.session.epochs.count() == 5
    assert CoverageGap.objects.filter(session=recorder.session).exists()


@pytest.mark.parametrize("failure", [StoragePressure("full"), ImproperlyConfigured("invalid"), OSError("tool unavailable"), PermissionError("credential unavailable")])
def test_non_input_launch_failures_remain_fatal(recorder_supervisor, monkeypatch, failure):
    supervisor, camera = recorder_supervisor

    def fail(_camera):
        raise failure

    monkeypatch.setattr(capture, "input_arguments", fail)
    supervisor.tick()
    camera.refresh_from_db()
    assert not camera.desired_recording
    assert str(camera.pk) not in supervisor.recorders
    assert not Segment.objects.exists()


def test_lost_lease_stops_registered_child(recorder_supervisor, monkeypatch):
    supervisor, camera = recorder_supervisor
    supervisor.tick()
    recorder = supervisor.recorders[str(camera.pk)]
    child = recorder.process
    assert recorder.session.child_identity["pid"] == child.pid

    def lost_lease():
        raise RuntimeError("lease lost")

    supervisor.lease_check = lost_lease
    monkeypatch.setattr(supervisor.stop_event, "wait", lambda timeout: False)
    supervisor.run()
    recorder.session.refresh_from_db()
    assert supervisor.error == "supervisor_unavailable_restart_required"
    assert recorder.session.status == "stopped"
    assert child.poll() is not None


def test_unavailable_validation_tool_remains_fatal(recorder_supervisor, monkeypatch):
    supervisor, camera = recorder_supervisor
    failures = []

    def unavailable(path, max_seconds=360):
        failures.append(True)
        raise MediaFailure("media_tool_unavailable_or_timeout")

    monkeypatch.setattr(capture, "validate_video", unavailable)
    tick_until(supervisor, lambda: bool(failures))
    camera.refresh_from_db()
    assert not camera.desired_recording
    assert str(camera.pk) not in supervisor.recorders
    assert not Segment.objects.exists()
