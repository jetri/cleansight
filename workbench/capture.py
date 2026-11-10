"""Single local supervisor, bounded FFmpeg recorders and independent media jobs.

No inference exists. Reconnect epochs are never stitched into evidence continuity.
"""

import csv
import os
import signal
import subprocess
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import urlsplit

from django.core.exceptions import ImproperlyConfigured
from django.db import close_old_connections
from django.utils import timezone

from litterwatch.runtime import read_secret, runtime_root

from .clips import assemble, assemble_frame
from .media import MediaFailure, snapshot, validate_video
from .models import Camera, CaptureSession, ClipJob, CoverageGap, Epoch, FrameJob, Segment
from .processes import identity, ownership_scope
from .services import interrupt_epoch, interrupt_sessions
from .storage import (
    StoragePressure,
    budget,
    media_root,
    pin,
    publish,
    reconcile,
    sweep,
)


def stop_process(process):
    if process.poll() is None:
        os.killpg(process.pid, signal.SIGTERM)
        try:
            process.wait(timeout=3)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL)
            process.wait(timeout=3)


def input_arguments(camera):
    value = read_secret(camera.secret_ref)
    if camera.kind == "rtsp":
        if urlsplit(value).scheme not in {"rtsp", "rtsps"} or any(
            c in value for c in ["\n", "\r", "\0"]
        ):
            raise ImproperlyConfigured("Invalid protected RTSP source")
        return ["-rtsp_transport", "tcp", "-timeout", "5000000", "-i", value]
    source = Path(value)
    root = (runtime_root() / "input").resolve()
    if source.is_symlink() or source.resolve().parent != root or not source.is_file():
        raise ImproperlyConfigured("Fixture input must be a private runtime input file")
    return ["-re", "-i", str(source)]


def preview(segment):
    close_old_connections()
    try:
        path, source_us = snapshot(segment, segment.index["frame_us"][-1])
        try:
            artifact = publish(
                path,
                "frame_unredacted",
                "image/jpeg",
                lineage=[str(segment.artifact_id)],
                metadata={
                    "source_us": source_us,
                    "epoch": str(segment.epoch_id),
                    "source_segment": str(segment.id),
                    "redacted": False,
                },
                ttl_seconds=30,
            )
            return {
                "artifact": str(artifact.id),
                "source_us": source_us,
                "epoch": str(segment.epoch_id),
                "published_at": timezone.now().isoformat(),
                "source_observed_at": segment.arrival_at.isoformat(),
            }
        finally:
            path.unlink(missing_ok=True)
    except (MediaFailure, StoragePressure, OSError):
        return {"status": "unavailable", "reason": "preview_failed"}
    finally:
        close_old_connections()


class Recorder:
    def __init__(self, camera):
        self.camera = camera
        self.session = CaptureSession.objects.create(
            camera=camera,
            configuration=camera.active_revision,
            provenance=camera.data_provenance,
            health={
                "transport": "connecting",
                "recording": "not_started",
                "processing": "not_implemented",
                "preview": "unavailable",
            },
        )
        self.process = None
        self.epoch = None
        self.origin_us = None
        self.last_end = None
        self.signature = None
        self.attempts = 0
        self.retry_at = 0
        self.offset = 0
        self.pending_csv = ""
        self.last_progress = time.monotonic()
        self.directory = None
        self.latest = None
        self.preview_future = None

    def launch(self):
        budget()
        args = input_arguments(self.camera)
        self.attempts += 1
        self.directory = media_root() / "staging" / str(self.session.id) / str(self.attempts)
        self.directory.mkdir(parents=True, mode=0o700)
        self.epoch = Epoch.objects.create(
            session=self.session,
            sequence=self.attempts,
            reason="source_start" if self.attempts == 1 else "reconnect_continuity_unverified",
            arrival_anchor=timezone.now(),
        )
        self.origin_us = self.last_end = self.signature = None
        self.offset = 0
        self.pending_csv = ""
        self.last_progress = time.monotonic()
        command = [
            "ffmpeg",
            "-nostdin",
            "-hide_banner",
            "-loglevel",
            "error",
            *args,
            "-map",
            "0:v:0",
            "-an",
            "-c:v",
            "copy",
            "-f",
            "segment",
            "-segment_time",
            str(self.session.configuration.settings["segment_seconds"]),
            "-reset_timestamps",
            "0",
            "-segment_list",
            str(self.directory / "sealed.csv"),
            "-segment_list_type",
            "csv",
            str(self.directory / "%06d.ts"),
        ]
        self.process = subprocess.Popen(
            command,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
        )
        self.session.child_identity = {
            "pid": self.process.pid,
            "generation": identity(self.process.pid),
            "scope": ownership_scope(),
        }
        self.session.status = "recording"
        self.session.health.update(
            transport="connecting",
            recording="awaiting_sealed_segment",
            processing="not_implemented",
        )
        try:
            self.session.save(update_fields=["status", "health", "child_identity"])
        except BaseException:
            stop_process(self.process)
            raise

    def catalog(self):
        listing = self.directory / "sealed.csv"
        if not listing.exists():
            return
        with listing.open() as stream:
            stream.seek(self.offset)
            self.pending_csv += stream.read(65536)
            self.offset = stream.tell()
        lines = self.pending_csv.split("\n")
        self.pending_csv = lines.pop()
        for row in csv.reader(lines):
            if len(row) != 3:
                raise MediaFailure("invalid_segment_publication")
            path = self.directory / Path(row[0]).name
            if path.parent.resolve() != self.directory.resolve() or not path.name.endswith(".ts"):
                raise MediaFailure("invalid_segment_publication")
            try:
                sealed_at = datetime.fromtimestamp(path.stat().st_mtime, tz=UTC)
                index = validate_video(path, max_seconds=60)
                raw_start, raw_end = index["start_us"], index["end_us"]
                signature = [
                    index[k]
                    for k in ["codec_name", "width", "height", "time_base", "avg_frame_rate"]
                ]
                if self.origin_us is None:
                    self.origin_us = raw_start
                    self.signature = signature
                start, end = raw_start - self.origin_us, raw_end - self.origin_us
                if self.last_end is not None and (
                    start < self.last_end - 1000 or signature != self.signature
                ):
                    raise MediaFailure("source_clock_or_format_discontinuity")
                if self.last_end is not None and start > self.last_end + 1000:
                    CoverageGap.objects.create(
                        session=self.session,
                        epoch=self.epoch,
                        start_us=self.last_end,
                        end_us=start,
                        reason="source_gap",
                    )
                index.update(
                    raw_start_us=raw_start,
                    raw_end_us=raw_end,
                    start_us=start,
                    end_us=end,
                    raw_frame_us=index["frame_us"],
                    frame_us=[t - self.origin_us for t in index["frame_us"]],
                    missing_spans=[
                        [a - self.origin_us, b - self.origin_us] for a, b in index["missing_spans"]
                    ],
                    origin_us=self.origin_us,
                )
                for a, b in index["missing_spans"]:
                    CoverageGap.objects.create(
                        session=self.session,
                        epoch=self.epoch,
                        start_us=a,
                        end_us=b,
                        reason="frame_cadence_unverified",
                    )
                artifact = publish(
                    path,
                    "raw_continuous",
                    "video/mp2t",
                    metadata={
                        "epoch": str(self.epoch.id),
                        "source_span_us": [start, end],
                        "index": index,
                        "provenance": self.session.provenance,
                    },
                    ttl_seconds=self.session.configuration.settings["retention_seconds"],
                )
                segment = Segment.objects.create(
                    epoch=self.epoch,
                    sequence=int(path.stem),
                    artifact=artifact,
                    start_us=start,
                    end_us=end,
                    index=index,
                    arrival_at=sealed_at,
                )
                # Preserve future source spans of already-requested event clips.
                if ClipJob.objects.filter(
                    event__epoch=self.epoch, start_us__lt=end, end_us__gt=start
                ).exists():
                    pin(artifact, "active-event-evidence", 3600)
                self.latest = segment
                self.last_end = end
                self.last_progress = time.monotonic()
                self.session.health.update(
                    transport="connected",
                    recording="sealed",
                    captured_through={"epoch": str(self.epoch.id), "source_us": end},
                    last_sealed_at=sealed_at.isoformat(),
                    catalogued_at=timezone.now().isoformat(),
                )
            except (MediaFailure, OSError):
                CoverageGap.objects.create(
                    session=self.session,
                    epoch=self.epoch,
                    start_us=self.last_end,
                    reason="media_or_clock_unverified",
                )
                raise MediaFailure("media_or_clock_unverified") from None
        self.session.save(update_fields=["health"])

    def finish(self, reason):
        if self.session.stopped_at is not None:
            return
        if self.process:
            stop_process(self.process)
            try:
                self.catalog()
            except (MediaFailure, StoragePressure, OSError):
                reason = "media_or_storage_unverified"
        CoverageGap.objects.create(
            session=self.session,
            epoch=self.epoch,
            start_us=self.last_end,
            reason=reason,
            ended_at=timezone.now(),
        )
        if self.epoch:
            interrupt_epoch(self.epoch, reason, self.last_end)
        self.session.status = "stopped"
        self.session.stopped_at = timezone.now()
        self.session.health.update(
            transport="stopped", recording="stopped", processing="not_implemented", reason=reason
        )
        self.session.save(update_fields=["status", "stopped_at", "health"])


class Supervisor:
    def __init__(self, lease_check=None):
        self.lease_check = lease_check
        self.stop_event = threading.Event()
        self.recorders = {}
        self.preview_pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix="preview")
        self.clip_pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix="clips")
        self.clip_future = None
        self.thread = None
        self.error = None

    def start(self):
        reconcile()
        interrupt_sessions()
        self.thread = threading.Thread(target=self.run, name="capture-supervisor", daemon=False)
        self.thread.start()

    def tick(self):
        desired = {
            str(c.id): c
            for c in Camera.objects.filter(desired_recording=True).select_related("active_revision")
        }
        for key in list(self.recorders):
            if key not in desired:
                self.recorders.pop(key).finish("operator_stop_tail_unverified")
        for key, camera in desired.items():
            if key not in self.recorders:
                self.recorders[key] = Recorder(camera)
            recorder = self.recorders[key]
            try:
                budget()
                if not recorder.process and time.monotonic() >= recorder.retry_at:
                    recorder.launch()
                if not recorder.process:
                    continue
                recorder.catalog()
                if recorder.preview_future and recorder.preview_future.done():
                    recorder.session.health["preview"] = recorder.preview_future.result()
                    recorder.session.save(update_fields=["health"])
                    recorder.preview_future = None
                if (
                    recorder.latest
                    and recorder.preview_future is None
                    and not any(r.preview_future for r in self.recorders.values())
                ):
                    recorder.preview_future = self.preview_pool.submit(preview, recorder.latest)
                    recorder.latest = None
                if (
                    recorder.process.poll() is not None
                    or time.monotonic() - recorder.last_progress > 20
                ):
                    stop_process(recorder.process)
                    recorder.catalog()
                    interrupt_epoch(recorder.epoch, "stream_gap", recorder.last_end)
                    CoverageGap.objects.create(
                        session=recorder.session,
                        epoch=recorder.epoch,
                        start_us=recorder.last_end,
                        reason="source_eof_or_disconnect",
                        ended_at=timezone.now(),
                    )
                    if camera.kind == "file_fixture" or recorder.attempts >= 5:
                        Camera.objects.filter(pk=camera.pk).update(desired_recording=False)
                        recorder.finish("source_eof_or_retry_exhausted")
                        del self.recorders[key]
                    else:
                        recorder.process = None
                        recorder.retry_at = time.monotonic() + min(2**recorder.attempts, 16)
                        recorder.session.health.update(
                            transport="reconnecting", recording="gap", reason="source_disconnected"
                        )
                        recorder.session.save(update_fields=["health"])
            except (MediaFailure, StoragePressure, ImproperlyConfigured, OSError):
                Camera.objects.filter(pk=camera.pk).update(desired_recording=False)
                recorder.finish("source_or_storage_failure")
                self.recorders.pop(key, None)
        if self.clip_future and self.clip_future.done():
            self.clip_future.result()
            self.clip_future = None
        if self.clip_future is None:
            job = (
                ClipJob.objects.filter(status="queued")
                .select_related("event__epoch")
                .order_by("created_at")
                .first()
            )
            if job:
                self.clip_future = self.clip_pool.submit(self.clip, job)
            else:
                frame = (
                    FrameJob.objects.filter(status="queued")
                    .select_related("segment__artifact")
                    .order_by("created_at")
                    .first()
                )
                if frame:
                    self.clip_future = self.clip_pool.submit(self.clip, frame)

    @staticmethod
    def clip(job):
        close_old_connections()
        try:
            if isinstance(job, FrameJob):
                assemble_frame(job)
            else:
                assemble(job)
        finally:
            close_old_connections()

    def run(self):
        last_sweep = time.monotonic()
        try:
            while not self.stop_event.wait(0.25):
                close_old_connections()
                if self.lease_check:
                    self.lease_check()  # Loss of DB ownership fails closed, never reclaims implicitly.
                self.tick()
                if time.monotonic() - last_sweep >= 10:
                    sweep()
                    last_sweep = time.monotonic()
        except Exception:
            # Database or unexpected supervisor failure is not a healthy empty feed.
            self.error = "supervisor_unavailable_restart_required"
        finally:
            for recorder in self.recorders.values():
                if recorder.process:
                    stop_process(recorder.process)
                if self.error:
                    try:
                        recorder.finish("supervisor_failure")
                    except Exception:
                        # If DB itself is down, API is degraded/unavailable and startup
                        # later records the unverified interval, never a clean negative.
                        pass
            close_old_connections()

    def stop(self):
        self.stop_event.set()
        if self.thread:
            self.thread.join(timeout=15)
            if self.thread.is_alive():
                raise RuntimeError("Supervisor did not stop within deadline")
        for recorder in self.recorders.values():
            recorder.finish("application_stop_tail_unverified")
        self.preview_pool.shutdown(wait=True, cancel_futures=True)
        self.clip_pool.shutdown(wait=True, cancel_futures=True)
        close_old_connections()
