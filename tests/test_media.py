import hashlib
import subprocess
from types import SimpleNamespace

import pytest
from django.test import Client

from workbench import services
from workbench.clips import assemble, assemble_frame, coverage
from workbench.media import validate_video
from workbench.storage import artifact_path

from .conftest import GEOMETRY


@pytest.mark.django_db
def test_full_clip_extension_replay_frame_and_corrupt_spans(captured):
    camera, session, epoch = captured
    one = services.replay(session, "observation_fixture")
    two = services.replay(session, "observation_fixture")
    assert one.id != two.id and one.input_manifest == two.input_manifest
    assert len(one.versions["backend_code_sha256"]) == 64
    assert one.versions["ffmpeg"].startswith("ffmpeg version")
    assert one.versions["dependencies"]["Django"] == "5.2.19"
    event = services.create_fixture(one, epoch, "synthetic-release", 20_000_000)
    newer = services.configure(camera, GEOMETRY, {"segment_seconds": 3})
    assert (
        services.replay(session, "observation_fixture").configuration_id == session.configuration_id
    )
    assert event.run.configuration_id == one.configuration_id != newer.id
    first = services.request_clip(event, 10_000_000, 53_000_000)
    assert [first.start_us, first.end_us] == [5_000_000, 65_000_000]
    assemble(first)
    first.refresh_from_db()
    assert first.status == "available" and first.coverage["missing"] == []
    first_artifact = first.artifacts.get()
    assert first_artifact.classification == "derived_unredacted"
    assert first_artifact.metadata["redacted"] is False
    index = validate_video(artifact_path(first_artifact))
    assert abs((index["end_us"] - index["start_us"]) - 60_000_000) < 200_000
    with artifact_path(first_artifact).open("rb") as stream:
        assert hashlib.file_digest(stream, "sha256").hexdigest() == first_artifact.sha256
    extended = services.request_clip(event, 10_000_000, 71_000_000)
    assemble(extended)
    extended.refresh_from_db()
    assert extended.status == "available" and extended.revision == first.revision + 1
    assert first.artifacts.get().id != extended.artifacts.get().id
    # Real frame extraction uses the source-indexed frame, not browser seeking.
    segment = epoch.segments.get(start_us=20_000_000)
    frame = services.request_frame(segment, 20_300_000)
    assemble_frame(frame)
    frame.refresh_from_db()
    assert frame.status == "available" and frame.artifact.metadata["source_us"] == 20_300_000
    assert artifact_path(frame.artifact).read_bytes().startswith(b"\xff\xd8")
    client = Client(HTTP_HOST="127.0.0.1")
    timeline = client.get(f"/api/runs/{one.id}/timeline").json()["data"]
    assert timeline["frames"][0]["source_us"] == 0 and len(timeline["frames"]) == 256
    assert timeline["clock"] == "epoch_source_microseconds_not_wall_time"
    assert "raw_pts" in timeline["frames"][0]
    # Intentionally corrupt one source segment; it cannot become continuous evidence.
    damaged = epoch.segments.select_related("artifact").get(start_us=30_000_000)
    artifact_path(damaged.artifact).write_bytes(b"not a video")
    partial = services.request_clip(event, 10_000_000, 53_000_000)
    assemble(partial)
    partial.refresh_from_db()
    assert partial.status == "partial"
    assert partial.coverage["missing"] == [[30_000_000, 32_000_000]]
    assert partial.coverage["required_missing"] == [[30_000_000, 32_000_000]]
    assert len(partial.coverage["parts"]) == 2
    damaged.artifact.refresh_from_db()
    assert damaged.artifact.status == "missing"
    assert event.transitions.count() == 0  # Media jobs do not invent machine decisions.
    # Existing derivative stays immutable/available; corruption cannot rewrite it.
    first_artifact.refresh_from_db()
    assert first_artifact.status == "available"


def test_internal_frame_gap_is_not_continuous_coverage():
    segment = SimpleNamespace(
        start_us=0, end_us=4_000_000, index={"missing_spans": [[1_000_000, 2_000_000]]}
    )
    available, missing = coverage([segment], 0, 4_000_000)
    assert available == [[0, 1_000_000], [2_000_000, 4_000_000]]
    assert missing == [[1_000_000, 2_000_000]]


def test_estimated_time_without_original_pts_is_not_complete_source(monkeypatch):
    import json

    from workbench.media import MediaFailure, probe

    payload = {
        "streams": [{"avg_frame_rate": "10/1", "time_base": "1/1000"}],
        "frames": [{"best_effort_timestamp_time": "0.0"}],
    }
    monkeypatch.setattr(
        "workbench.media.run_tool", lambda *args, **kwargs: json.dumps(payload).encode()
    )
    with pytest.raises(MediaFailure):
        probe("fixture-without-original-timestamps")


def test_real_pts_gap_is_indexed(private_runtime):
    path = private_runtime / "input" / "gap.mp4"
    subprocess.run(
        [
            "ffmpeg",
            "-nostdin",
            "-v",
            "error",
            "-f",
            "lavfi",
            "-i",
            "testsrc2=size=160x120:rate=10:duration=3",
            "-vf",
            r"setpts=if(gte(N\,10)\,PTS+1/TB\,PTS)",
            "-fps_mode",
            "vfr",
            "-c:v",
            "libx264",
            "-g",
            "10",
            str(path),
        ],
        check=True,
        timeout=15,
    )
    index = validate_video(path)
    assert index["missing_spans"] == [[1_000_000, 2_000_000]]
