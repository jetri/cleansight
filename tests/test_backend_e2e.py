"""Real socket -> ASGI -> PostgreSQL -> FFmpeg -> private media, no UI/model."""

import http.cookiejar
import json
import os
import shutil
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from contextlib import contextmanager
from pathlib import Path

import pytest
from django.db import connection

from .conftest import GEOMETRY


@contextmanager
def running_backend(runtime):
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    env = {**os.environ, "LITTERING_DB_NAME": connection.settings_dict["NAME"]}
    log = runtime / f"backend-{port}.log"
    with log.open("wb") as output:
        process = subprocess.Popen(
            [sys.executable, "-m", "litterwatch", "--port", str(port)],
            cwd=Path(__file__).resolve().parents[1],
            env=env,
            stdout=output,
            stderr=output,
        )
        try:
            yield process, f"http://127.0.0.1:{port}", log
        finally:
            if process.poll() is None:
                process.terminate()
                process.wait(timeout=20)


def wait_until(function, timeout=20):
    end = time.monotonic() + timeout
    last = None
    while time.monotonic() < end:
        try:
            last = function()
            if last:
                return last
        except (OSError, urllib.error.URLError):
            pass
        time.sleep(0.15)
    raise AssertionError(f"Condition not satisfied within {timeout}s: {last!r}")


@pytest.mark.django_db(transaction=True)
def test_socket_camera_capture_replay_feedback_restart(private_runtime, synthetic):
    for name in ["source_a", "source_b"]:
        source = private_runtime / "input" / f"{name}.mp4"
        shutil.copyfile(synthetic, source)
        ref = private_runtime / "secrets" / name
        ref.write_text(str(source))
        ref.chmod(0o600)
    client = urllib.request.build_opener(
        urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar())
    )
    token = None

    def call(path, data=None, headers=None):
        request = urllib.request.Request(
            base + path,
            data=json.dumps(data).encode() if data is not None else None,
            headers={
                "Content-Type": "application/json",
                **({"X-CSRFToken": token} if token else {}),
                **(headers or {}),
            },
        )
        try:
            with client.open(request, timeout=8) as result:
                return result.status, result.read(), dict(result.headers)
        except urllib.error.HTTPError as error:
            return error.code, error.read(), dict(error.headers)

    def get(path):
        status, content, _ = call(path)
        assert status == 200, content
        return json.loads(content)["data"]

    def post(path, data):
        status, content, _ = call(path, data)
        assert status in {201, 202}, content
        return json.loads(content)["data"]

    with running_backend(private_runtime) as (process, base, log):
        result = wait_until(lambda: call("/api/health"))
        assert result[0] == 200
        token = json.loads(result[1])["data"]["csrf_token"]
        assert "UNVALIDATED" in result[1].decode()
        assert call("/api/cameras", {}, {"X-CSRFToken": "bad"})[0] == 403
        assert call("/api/cameras", {}, {"Origin": "http://external.invalid"})[0] == 403
        cameras = []
        for name in ["source_a", "source_b"]:
            camera = post(
                "/api/cameras",
                {
                    "name": name,
                    "kind": "file_fixture",
                    "secret_ref": name,
                    "permission_ref": "generated synthetic test",
                },
            )
            post(f"/api/cameras/{camera['id']}/configurations", {"geometry": GEOMETRY})
            post(f"/api/cameras/{camera['id']}/recording", {"enabled": True})
            cameras.append(camera)
        sessions = wait_until(
            lambda: [s for s in get("/api/sessions") if s["health"].get("captured_through")],
            timeout=15,
        )
        sessions = wait_until(
            lambda: (
                s
                if len(
                    s := [s for s in get("/api/sessions") if s["health"].get("captured_through")]
                )
                == 2
                else None
            ),
            timeout=15,
        )
        preview = wait_until(
            lambda: next(
                (
                    s["health"].get("preview")
                    for s in get("/api/sessions")
                    if isinstance(s["health"].get("preview"), dict)
                    and s["health"]["preview"].get("artifact")
                ),
                None,
            )
        )
        assert preview["stale"] is False
        assert call("/media/" + preview["artifact"])[1].startswith(b"\xff\xd8")
        session = sessions[0]
        for camera in cameras:
            post(f"/api/cameras/{camera['id']}/recording", {"enabled": False})
        wait_until(lambda: all(s["stopped_at"] for s in get("/api/sessions")))
        run = post(f"/api/sessions/{session['id']}/replays", {"mode": "observation_fixture"})
        assert run["input_manifest"]["clock"] == "epoch_source_microseconds_not_wall_time"
        event = post(
            f"/api/runs/{run['id']}/events",
            {
                "epoch": session["epochs"][0]["id"],
                "release_key": "fixture-release",
                "release_us": 1_000_000,
            },
        )
        assert (
            call(
                f"/api/events/{event['id']}/transitions",
                {
                    "sequence": 1,
                    "state": "RELEASE_CANDIDATE",
                    "source_us": 1_000_000,
                    "reason": "fixture",
                },
            )[0]
            == 400
        )
        post(
            f"/api/events/{event['id']}/transitions",
            {
                "sequence": 1,
                "state": "INTERACTION_CANDIDATE",
                "source_us": 500_000,
                "reason": "fixture-supplied-not-detected",
            },
        )
        final = post(
            f"/api/events/{event['id']}/transitions",
            {
                "sequence": 2,
                "state": "INCOMPLETE",
                "source_us": 1_000_000,
                "reason": "fixture-source-too-short",
            },
        )
        assert final["phase"] == "final" and "FIXTURE" in final["label"]
        post(
            f"/api/events/{event['id']}/reviews",
            {
                "state": "needs_better_footage",
                "reason": "fixture",
                "notes": "<script>not executable</script>",
                "reviewer_label": "local-test-not-authenticated",
            },
        )
        job = post(
            f"/api/events/{event['id']}/clips",
            {"required_start_us": 0, "required_end_us": 3_000_000},
        )
        clip = wait_until(
            lambda: (
                c
                if (c := get(f"/api/clips/{job['id']}"))["status"]
                in {"partial", "available", "failed"}
                else None
            ),
            timeout=30,
        )
        assert clip["status"] == "partial" and clip["coverage"]["missing"]
        media_id = clip["media"][0]
        code, block, headers = call("/media/" + media_id, headers={"Range": "bytes=0-99"})
        assert (
            code == 206 and len(block) == 100 and headers["Content-Range"].startswith("bytes 0-99/")
        )
        assert call("/media/" + media_id, headers={"Range": "bytes=0-9,20-29"})[0] == 416
        assert call("/media/../../secrets/db_app")[0] == 404
        with running_backend(private_runtime) as (duplicate, _, duplicate_log):
            assert duplicate.wait(timeout=10) != 0
            assert "Backend startup failed" in duplicate_log.read_text()
        assert process.poll() is None
    assert "Traceback" not in log.read_text()
    with running_backend(private_runtime) as (_, base, _):
        wait_until(lambda: call("/api/health"))
        restored = get(f"/api/events/{event['id']}")
        assert len(restored["transitions"]) == 2 and restored["machine_outcome"] == "INCOMPLETE"
        assert restored["reviews"][0]["notes"] == "<script>not executable</script>"
        assert all(not c["desired_recording"] for c in get("/api/cameras"))
        assert all(s["health"].get("processing") == "not_implemented" for s in get("/api/sessions"))
