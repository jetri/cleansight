"""Concrete local paths and secret references, never exported secret values."""

import os
import re
import stat
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured


def runtime_root():
    return Path(os.environ.get("LITTERING_RUNTIME", Path.home() / ".local/share/littering"))


def read_secret(reference):
    if not re.fullmatch(r"[a-zA-Z0-9_-]{1,80}", reference):
        raise ImproperlyConfigured("Invalid secret reference")
    path = runtime_root() / "secrets" / reference
    try:
        info = path.lstat()
        if not stat.S_ISREG(info.st_mode) or info.st_mode & 0o077 or info.st_uid != os.getuid():
            raise ValueError
        value = path.read_text().strip()
        if not value:
            raise ValueError
        return value
    except (OSError, ValueError):
        raise ImproperlyConfigured("Missing or unprotected runtime secret") from None
