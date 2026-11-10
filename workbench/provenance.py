"""Concrete producing-code/runtime identity; not a security audit or model claim."""

import hashlib
import importlib.metadata
import platform
import subprocess
from functools import lru_cache
from pathlib import Path


@lru_cache(maxsize=1)
def versions():
    root = Path(__file__).resolve().parents[1]
    digest = hashlib.sha256()
    for folder in ["litterwatch", "workbench"]:
        for path in sorted((root / folder).rglob("*.py")):
            digest.update(str(path.relative_to(root)).encode())
            digest.update(path.read_bytes())
    try:
        output = subprocess.run(["ffmpeg", "-version"], capture_output=True, timeout=3, check=True)
        ffmpeg = output.stdout.decode(errors="replace").splitlines()[0]
    except (OSError, subprocess.SubprocessError, IndexError):
        ffmpeg = "unavailable"
    return {
        "application": "0.1.0",
        "backend_code_sha256": digest.hexdigest(),
        "python": platform.python_version(),
        "dependencies": {
            name: importlib.metadata.version(name)
            for name in ["Django", "psycopg", "shapely", "uvicorn"]
        },
        "ffmpeg": ffmpeg,
        "method": "M01-media-only-no-detector",
    }
