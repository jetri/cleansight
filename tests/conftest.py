import os
import shutil
import subprocess
from pathlib import Path

import pytest
from django.utils import timezone

from workbench import services
from workbench.media import validate_video
from workbench.models import CaptureSession, Epoch, ProcessingRun, Segment
from workbench.storage import publish

GEOMETRY = {
    "zones": [{"name": "ground", "points": [[0, 0], [1, 0], [1, 1], [0, 1]]}],
    "exclusions": [{"name": "bin", "points": [[0.7, 0.7], [0.9, 0.7], [0.9, 0.9], [0.7, 0.9]]}],
    "boundary": 0.01,
}


@pytest.fixture(autouse=True)
def private_runtime(tmp_path, monkeypatch):
    original = Path(os.environ["LITTERING_RUNTIME"])
    root = tmp_path / "runtime"
    root.mkdir(mode=0o700)
    for name in ["media", "input", "secrets"]:
        (root / name).mkdir(mode=0o700)
    for name in ["django_key", "db_app"]:
        shutil.copyfile(original / "secrets" / name, root / "secrets" / name)
        (root / "secrets" / name).chmod(0o600)
    monkeypatch.setenv("LITTERING_RUNTIME", str(root))
    monkeypatch.setenv("LITTERING_RESERVE_BYTES", "1048576")
    return root


@pytest.fixture(scope="session")
def synthetic(tmp_path_factory):
    root = tmp_path_factory.mktemp("synthetic")
    path = root / "source.mp4"
    subprocess.run(
        [
            "ffmpeg",
            "-nostdin",
            "-v",
            "error",
            "-f",
            "lavfi",
            "-i",
            "testsrc2=size=320x240:rate=10",
            "-t",
            "72",
            "-c:v",
            "libx264",
            "-preset",
            "ultrafast",
            "-g",
            "10",
            "-pix_fmt",
            "yuv420p",
            str(path),
        ],
        check=True,
        timeout=30,
    )
    return path


@pytest.fixture
def captured(db, private_runtime, synthetic):
    """Actual encoded segments; no detector observations or natural footage."""
    source = private_runtime / "input" / "synthetic.mp4"
    shutil.copyfile(synthetic, source)
    secret = private_runtime / "secrets" / "source_a"
    secret.write_text(str(source))
    secret.chmod(0o600)
    camera = services.create_camera(
        "Synthetic source", "file_fixture", "source_a", "permission-safe-generated-fixture"
    )
    revision = services.configure(camera, GEOMETRY, {})
    camera.refresh_from_db()
    session = CaptureSession.objects.create(
        camera=camera,
        configuration=revision,
        provenance="synthetic_file_fixture",
        status="stopped",
        stopped_at=timezone.now(),
    )
    epoch = Epoch.objects.create(
        session=session, sequence=1, reason="fixture_start", arrival_anchor=timezone.now()
    )
    directory = private_runtime / "media" / "staging"
    directory.mkdir(mode=0o700)
    subprocess.run(
        [
            "ffmpeg",
            "-nostdin",
            "-v",
            "error",
            "-i",
            str(source),
            "-c:v",
            "copy",
            "-an",
            "-f",
            "segment",
            "-segment_time",
            "2",
            "-reset_timestamps",
            "0",
            str(directory / "%03d.ts"),
        ],
        check=True,
        timeout=15,
    )
    origin = None
    for sequence, path in enumerate(sorted(directory.glob("*.ts"))):
        index = validate_video(path, max_seconds=60)
        origin = index["start_us"] if origin is None else origin
        start, end = index["start_us"] - origin, index["end_us"] - origin
        index.update(
            raw_start_us=index["start_us"],
            raw_end_us=index["end_us"],
            start_us=start,
            end_us=end,
            raw_frame_us=index["frame_us"],
            frame_us=[t - origin for t in index["frame_us"]],
            missing_spans=[[a - origin, b - origin] for a, b in index["missing_spans"]],
            origin_us=origin,
        )
        artifact = publish(
            path, "raw_continuous", "video/mp2t", metadata={"provenance": "synthetic_file_fixture"}
        )
        Segment.objects.create(
            epoch=epoch,
            sequence=sequence,
            artifact=artifact,
            start_us=start,
            end_us=end,
            index=index,
            arrival_at=timezone.now(),
        )
    return camera, session, epoch


@pytest.fixture
def fixture_event(db):
    camera = services.create_camera(
        "Source", "file_fixture", "secret-reference", "synthetic-permission"
    )
    revision = services.configure(camera, GEOMETRY, {})
    camera.refresh_from_db()
    session = CaptureSession.objects.create(
        camera=camera, configuration=revision, provenance="synthetic_file_fixture"
    )
    epoch = Epoch.objects.create(
        session=session, sequence=1, reason="fixture", arrival_anchor=timezone.now()
    )
    run = ProcessingRun.objects.create(
        session=session,
        configuration=revision,
        mode="observation_fixture",
        input_manifest={},
        versions={},
    )
    return services.create_fixture(run, epoch, "physical-fixture-1", 20_000_000)
