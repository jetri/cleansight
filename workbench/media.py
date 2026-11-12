"""Bounded ordinary FFmpeg jobs, never a second browser-facing service."""

import json
import subprocess
import tempfile
from fractions import Fraction
from pathlib import Path
from statistics import median

from django.core.exceptions import ValidationError

from .storage import media_root


class MediaFailure(Exception):
    pass


def run_tool(argv, timeout=20, output_limit=4 * 1024**2):
    # Do not log credential-bearing argv or stderr. Only stable reason codes escape.
    try:
        with tempfile.TemporaryFile() as output:
            result = subprocess.run(
                argv, stdout=output, stderr=subprocess.DEVNULL, timeout=timeout, check=False
            )
            if result.returncode < 0:
                raise MediaFailure("media_tool_signaled")
            if output.tell() > output_limit:
                raise MediaFailure("media_tool_output_limit")
            if result.returncode:
                raise MediaFailure("media_tool_failed")
            output.seek(0)
            return output.read()
    except (OSError, subprocess.TimeoutExpired):
        raise MediaFailure("media_tool_unavailable_or_timeout") from None


def probe(path, max_seconds=360):
    raw = run_tool(
        [
            "ffprobe",
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-read_intervals",
            "%+#21601",
            "-show_entries",
            "stream=codec_name,width,height,avg_frame_rate,time_base:frame=pts,best_effort_timestamp_time,pkt_duration_time,duration_time",
            "-of",
            "json",
            str(path),
        ]
    )
    try:
        data = json.loads(raw)
        stream = data["streams"][0]
        frames = data["frames"]
        if not 1 <= len(frames) <= 21600 or any(f.get("pts") is None for f in frames):
            raise ValueError  # Estimated timestamps alone cannot establish source coverage.
        times = [round(float(f["best_effort_timestamp_time"]) * 1_000_000) for f in frames]
        if any(b <= a for a, b in zip(times, times[1:], strict=False)):
            raise ValueError
        duration = float(
            frames[-1].get(
                "duration_time",
                frames[-1].get("pkt_duration_time", 1 / Fraction(stream["avg_frame_rate"])),
            )
        )
        end = times[-1] + round(duration * 1_000_000)
        cadence = (
            round(median([b - a for a, b in zip(times, times[1:], strict=False)]))
            if len(times) > 1
            else round(duration * 1_000_000)
        )
        missing = [
            [a + cadence, b]
            for a, b in zip(times, times[1:], strict=False)
            if b - a > max(cadence * 1.5, cadence + 1000)
        ]
        if end <= times[0] or end - times[0] > max_seconds * 1_000_000:
            raise ValueError
        return {
            **stream,
            "raw_pts": [f.get("pts") for f in frames],
            "frame_us": times,
            "missing_spans": missing,
            "start_us": times[0],
            "end_us": end,
        }
    except (KeyError, IndexError, ValueError, TypeError, ZeroDivisionError):
        raise MediaFailure("media_index_invalid_or_segment_too_long") from None


def validate_video(path, max_seconds=360):
    index = probe(path, max_seconds=max_seconds)
    run_tool(
        [
            "ffmpeg",
            "-nostdin",
            "-v",
            "error",
            "-xerror",
            "-i",
            str(path),
            "-map",
            "0:v:0",
            "-f",
            "null",
            "-",
        ],
        timeout=30,
    )
    return index


def temp_media(suffix):
    file = tempfile.NamedTemporaryFile(dir=media_root(), suffix=suffix, delete=False)
    file.close()
    return Path(file.name)


def render_span(segments, start_us, end_us):
    from .storage import artifact_path

    if not segments or end_us <= start_us:
        raise ValidationError("Empty clip span")
    output = temp_media(".mp4")
    manifest = temp_media(".txt")
    try:
        # Catalog paths contain generated UUIDs, never user-supplied concat syntax.
        manifest.write_text("".join(f"file '{artifact_path(s.artifact)}'\n" for s in segments))
        offset = (start_us - segments[0].start_us) / 1_000_000
        duration = (end_us - start_us) / 1_000_000
        run_tool(
            [
                "ffmpeg",
                "-nostdin",
                "-v",
                "error",
                "-y",
                "-f",
                "concat",
                "-safe",
                "0",
                "-i",
                str(manifest),
                "-ss",
                str(offset),
                "-t",
                str(duration),
                "-map",
                "0:v:0",
                "-an",
                "-c:v",
                "libx264",
                "-preset",
                "veryfast",
                "-pix_fmt",
                "yuv420p",
                "-movflags",
                "+faststart",
                str(output),
            ],
            timeout=45,
        )
        index = validate_video(output)
        if abs((index["end_us"] - index["start_us"]) - (end_us - start_us)) > 250_000:
            raise MediaFailure("clip_duration_mismatch")
        return output, index
    except BaseException:
        output.unlink(missing_ok=True)
        raise
    finally:
        manifest.unlink(missing_ok=True)


def frame_index(segment, source_us):
    if not segment.start_us <= source_us < segment.end_us:
        raise ValidationError("Frame lies outside segment")
    index = next((i for i, t in enumerate(segment.index["frame_us"]) if t >= source_us), None)
    if index is None:
        raise ValidationError("No indexed frame at or after requested source time")
    return index


def snapshot(segment, source_us):
    from .storage import verified_path

    index = frame_index(segment, source_us)
    frames = segment.index["frame_us"]
    output = temp_media(".jpg")
    try:
        run_tool(
            [
                "ffmpeg",
                "-nostdin",
                "-v",
                "error",
                "-y",
                "-i",
                str(verified_path(segment.artifact)),
                "-vf",
                f"select=eq(n\\,{index})",
                "-frames:v",
                "1",
                "-q:v",
                "3",
                str(output),
            ]
        )
        if output.stat().st_size < 4 or not output.read_bytes().startswith(b"\xff\xd8"):
            raise MediaFailure("snapshot_invalid")
        return output, frames[index]
    except BaseException:
        output.unlink(missing_ok=True)
        raise
