"""File-only strict validation regressions using generated video, never camera input."""

import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from django.conf import settings

if not settings.configured:
    settings.configure(
        INSTALLED_APPS=["workbench"],
        DATABASES={"default": {"ENGINE": "django.db.backends.dummy"}},
        SECRET_KEY="synthetic-test",
    )
    import django

    django.setup()

from workbench.media import MediaFailure, probe, run_tool, validate_video


class StrictMediaCauseTests(unittest.TestCase):
    def test_generated_post_probe_invalid_data(self):
        with tempfile.TemporaryDirectory() as directory:
            valid = Path(directory) / "valid.ts"
            corrupt = Path(directory) / "corrupt.ts"
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
                    "3",
                    "-c:v",
                    "libx264",
                    "-preset",
                    "ultrafast",
                    "-threads",
                    "1",
                    "-g",
                    "10",
                    "-bf",
                    "0",
                    "-pix_fmt",
                    "yuv420p",
                    "-mpegts_start_pid",
                    "256",
                    "-f",
                    "mpegts",
                    str(valid),
                ],
                check=True,
                timeout=30,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            self.assertEqual(len(validate_video(valid)["frame_us"]), 30)
            raw = valid.read_bytes()
            self.assertEqual(len(raw) % 188, 0)
            self.assertTrue(all(raw[i] == 0x47 for i in range(0, len(raw), 188)))
            video = [
                i
                for i in range(len(raw) // 188)
                if ((raw[i * 188 + 1] & 31) * 256 + raw[i * 188 + 2]) == 256
            ]
            starts = [i for i in video if raw[i * 188 + 1] & 64]
            continuation = [
                i for i in video if starts[10] < i < starts[11] and not raw[i * 188 + 1] & 64
            ]
            self.assertGreaterEqual(len(continuation), 3)
            packet = continuation[2]
            corrupt.write_bytes(raw[: packet * 188] + raw[(packet + 1) * 188 :])
            self.assertEqual(len(probe(corrupt)["frame_us"]), 30)
            with self.assertRaisesRegex(MediaFailure, "^media_invalid_input$"):
                validate_video(corrupt)
            invalid = Path(directory) / "invalid.ts"
            invalid.write_bytes(b"not a video")
            with self.assertRaisesRegex(MediaFailure, "^media_invalid_input$"):
                validate_video(invalid)
            with self.assertRaisesRegex(MediaFailure, "^media_tool_failed$"):
                validate_video(Path(directory) / "Invalid data found when processing input")

    def test_diagnostic_origin_and_operational_priority(self):
        decoder = (
            "[vist#0:0/h264 @ 0xabc] [dec:h264 @ 0xdef] "
            "Task finished with error code: -1094995529 "
            "(Invalid data found when processing input)"
        )

        def run(message, code=1, limit=4096, path="/synthetic/source.ts"):
            program = "import sys; print(sys.argv[1], file=sys.stderr); sys.exit(int(sys.argv[2]))"
            return run_tool(
                [sys.executable, "-c", program, message, str(code)],
                timeout=5,
                output_limit=limit,
                invalid_input="decode",
                input_path=path,
            )

        with self.assertRaisesRegex(MediaFailure, "^media_invalid_input$"):
            run(decoder)
        for message, path in [
            (decoder, decoder),
            ("unrelated " + decoder, "/synthetic/source.ts"),
            ("Invalid data found when processing input", "/synthetic/source.ts"),
        ]:
            with self.assertRaisesRegex(MediaFailure, "^media_tool_failed$"):
                run(message, path=path)
        with self.assertRaisesRegex(MediaFailure, "^media_tool_output_limit$"):
            run(decoder, limit=10)
        with self.assertRaisesRegex(MediaFailure, "^media_tool_failed$"):
            run("unknown", code=183)
        program = "import os, signal, sys; print(sys.argv[1], file=sys.stderr, flush=True); os.kill(os.getpid(), signal.SIGTERM)"
        with self.assertRaisesRegex(MediaFailure, "^media_tool_signaled$"):
            run_tool(
                [sys.executable, "-c", program, decoder],
                timeout=5,
                invalid_input="decode",
                input_path="/synthetic/source.ts",
            )


if __name__ == "__main__":
    unittest.main()
