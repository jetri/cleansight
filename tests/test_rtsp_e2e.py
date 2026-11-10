"""Opt-in transport fixture: one pinned MediaMTX container, loopback TCP only.

This is justified by the RTSP/reconnect contract; it is not application infrastructure
or target-camera accuracy evidence. All sources contain generated test patterns.
"""

import http.cookiejar
import json
import os
import signal
import socket
import subprocess
import sys
import time
import urllib.request
import uuid
from contextlib import contextmanager

import pytest

from workbench.models import CaptureSession
from workbench.processes import identity

from .conftest import GEOMETRY
from .test_backend_e2e import running_backend, wait_until

IMAGE = (
    "bluenviron/mediamtx:1@sha256:59e43552f3be43695b70c19424dc2a42fcec18075f88d91561a24ac5d70a586c"
)


def stop_publisher(process):
    """Bounded shutdown of this fixture's Popen handle, including stalled RTSP I/O."""
    if process.poll() is None:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=3)


def cleanup_fixture(publishers, name):
    failures = []
    try:
        for process in publishers:
            try:
                stop_publisher(process)
            except BaseException as error:
                failures.append(error)
    finally:
        try:
            subprocess.run(
                ["docker", "rm", "-f", name], capture_output=True, timeout=15, check=True
            )
        except BaseException as error:
            failures.append(error)
    if failures:
        raise BaseExceptionGroup("Owned RTSP fixture cleanup failed", failures)


@contextmanager
def rtsp_fixture(source):
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    name = "littering-m01-rtsp-" + uuid.uuid4().hex[:12]
    command = [
        "docker",
        "run",
        "--rm",
        "-d",
        "--name",
        name,
        "-e",
        "MTX_RTSPTRANSPORTS=tcp",
        "-e",
        "MTX_RTMP=false",
        "-e",
        "MTX_WEBRTC=false",
        "-e",
        "MTX_HLS=false",
        "-e",
        "MTX_SRT=false",
        "-p",
        f"127.0.0.1:{port}:8554",
        IMAGE,
    ]
    url = f"rtsp://127.0.0.1:{port}/fixture"
    publishers = []

    def publish():
        process = subprocess.Popen(
            [
                "ffmpeg",
                "-nostdin",
                "-v",
                "error",
                "-re",
                "-stream_loop",
                "-1",
                "-i",
                str(source),
                "-an",
                "-c:v",
                "copy",
                "-f",
                "rtsp",
                "-rtsp_transport",
                "tcp",
                url,
            ],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        publishers.append(process)
        return process

    try:
        subprocess.run(command, check=True, capture_output=True, timeout=20)
        time.sleep(0.5)
        print(
            json.dumps(
                {
                    "kind": "synthetic_rtsp_fixture",
                    "port": port,
                    "source_size": "320x240",
                    "source_fps": 10,
                    "fixture_seconds": 72,
                    "transport": "TCP",
                    "container": name,
                }
            )
        )
        yield url, publish
    finally:
        primary = sys.exception()
        try:
            cleanup_fixture(publishers, name)
        except BaseException as cleanup:
            if primary:
                raise BaseExceptionGroup(
                    "RTSP scenario and cleanup both failed", [primary, cleanup]
                ) from None
            raise


@pytest.mark.skipif(
    os.environ.get("LITTERING_RTSP_TEST") != "1", reason="Opt-in isolated Docker RTSP fixture"
)
@pytest.mark.django_db(transaction=True)
def test_two_rtsp_reconnect_epochs_and_unclean_application_restart(private_runtime, synthetic):
    with rtsp_fixture(synthetic) as (url, publish):
        publisher = publish()
        for ref in ["rtsp_a", "rtsp_b"]:
            path = private_runtime / "secrets" / ref
            path.write_text(url)
            path.chmod(0o600)
        client = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar())
        )
        token = None

        def request(path, data=None):
            body = json.dumps(data).encode() if data is not None else None
            req = urllib.request.Request(
                base + path,
                data=body,
                headers={
                    "Content-Type": "application/json",
                    **({"X-CSRFToken": token} if token else {}),
                },
            )
            with client.open(req, timeout=10) as response:
                return json.load(response)["data"]

        with running_backend(private_runtime) as (process, base, log):
            health = wait_until(lambda: request("/api/health"))
            token = health["csrf_token"]
            cameras = []
            for ref in ["rtsp_a", "rtsp_b"]:
                camera = request(
                    "/api/cameras",
                    {
                        "name": "RTSP synthetic fixture " + ref,
                        "kind": "rtsp",
                        "secret_ref": ref,
                        "permission_ref": "generated fixture, no camera",
                        "data_provenance": "synthetic",
                    },
                )
                request(f"/api/cameras/{camera['id']}/configurations", {"geometry": GEOMETRY})
                request(f"/api/cameras/{camera['id']}/recording", {"enabled": True})
                cameras.append(camera)
            sessions = wait_until(
                lambda: (
                    s
                    if len(
                        s := [
                            s
                            for s in request("/api/sessions")
                            if s["health"].get("captured_through")
                        ]
                    )
                    == 2
                    else None
                ),
                timeout=20,
            )
            assert all(s["provenance"] == "synthetic" for s in sessions)
            session = sessions[0]
            run = request(f"/api/sessions/{session['id']}/replays", {"mode": "observation_fixture"})
            event = request(
                f"/api/runs/{run['id']}/events",
                {
                    "epoch": session["epochs"][0]["id"],
                    "release_key": "rtsp-fixture",
                    "release_us": 1_000_000,
                },
            )
            request(
                f"/api/events/{event['id']}/transitions",
                {
                    "sequence": 1,
                    "state": "INTERACTION_CANDIDATE",
                    "source_us": 500_000,
                    "reason": "injected fixture only",
                },
            )
            stop_publisher(publisher)
            wait_until(
                lambda: next(
                    (s for s in request("/api/sessions") if s["id"] == session["id"] and s["gaps"]),
                    None,
                ),
                timeout=15,
            )
            incomplete = wait_until(
                lambda: (
                    e
                    if (e := request(f"/api/events/{event['id']}"))["machine_outcome"]
                    == "INCOMPLETE"
                    else None
                )
            )
            assert incomplete["transitions"][-1]["reason"] == "stream_gap"
            publisher = publish()
            resumed = wait_until(
                lambda: next(
                    (
                        s
                        for s in request("/api/sessions")
                        if s["id"] == session["id"]
                        and len(s["epochs"]) >= 2
                        and s["health"].get("captured_through", {}).get("epoch")
                        == str(s["epochs"][-1]["id"])
                    ),
                    None,
                ),
                timeout=30,
            )
            assert resumed["epochs"][0]["id"] != resumed["epochs"][-1]["id"]
            print(
                json.dumps(
                    {
                        "kind": "rtsp_reconnect_result",
                        "source_count": 2,
                        "epoch_count": len(resumed["epochs"]),
                        "gap_count": len(resumed["gaps"]),
                        "recorded_through": resumed["health"]["captured_through"],
                        "fixture_outcome": "INCOMPLETE",
                    }
                )
            )
            # Simulate actual application death after durable child registration.
            child_records = list(
                CaptureSession.objects.filter(stopped_at=None).values_list(
                    "child_identity", flat=True
                )
            )
            assert len(child_records) == 2 and all(c["generation"] for c in child_records)
            os.kill(process.pid, signal.SIGKILL)
            process.wait(timeout=5)
        # Same runtime + database scope reaps only matching registered orphan recorders.
        with running_backend(private_runtime) as (_, base, log):
            token = wait_until(lambda: request("/api/health"))["csrf_token"]
            wait_until(
                lambda: all(identity(c["pid"]) != c["generation"] for c in child_records),
                timeout=10,
            )
            recovered = request("/api/sessions")
            old = [s for s in recovered if s["id"] in {x["id"] for x in sessions}]
            assert all(
                s["status"] == "interrupted"
                and any(g["reason"] == "restart_coverage_unverified" for g in s["gaps"])
                for s in old
            )
            for camera in cameras:
                request(f"/api/cameras/{camera['id']}/recording", {"enabled": False})
            assert request(f"/api/events/{event['id']}")["machine_outcome"] == "INCOMPLETE"
        assert "Traceback" not in log.read_text()


def test_publisher_timeout_uses_only_handle_and_bounded_kill():
    from unittest.mock import Mock, call

    process = Mock()
    process.poll.return_value = None
    process.wait.side_effect = [subprocess.TimeoutExpired("fixture", 5), 0]
    stop_publisher(process)
    assert process.mock_calls == [
        call.poll(),
        call.terminate(),
        call.wait(timeout=5),
        call.kill(),
        call.wait(timeout=3),
    ]


def test_cleanup_attempts_every_owned_resource_and_reports_failures(monkeypatch):
    from unittest.mock import Mock

    first, second = Mock(), Mock()
    first.poll.side_effect = OSError("fixture stop failure")
    second.poll.return_value = None
    docker = Mock(
        side_effect=subprocess.CalledProcessError(1, ["docker", "rm", "-f", "exact-fixture"])
    )
    monkeypatch.setattr(subprocess, "run", docker)
    with pytest.raises(BaseExceptionGroup) as result:
        cleanup_fixture([first, second], "exact-fixture")
    assert len(result.value.exceptions) == 2
    second.terminate.assert_called_once()
    second.wait.assert_called_once_with(timeout=5)
    docker.assert_called_once_with(
        ["docker", "rm", "-f", "exact-fixture"], capture_output=True, timeout=15, check=True
    )


def test_publisher_final_wait_failure_is_not_suppressed():
    from unittest.mock import Mock

    process = Mock()
    process.poll.return_value = None
    process.wait.side_effect = [
        subprocess.TimeoutExpired("fixture", 5),
        subprocess.TimeoutExpired("fixture", 3),
    ]
    with pytest.raises(subprocess.TimeoutExpired):
        stop_publisher(process)
    process.kill.assert_called_once()
