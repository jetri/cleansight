"""Recover only a recorder registered by this database's previous local owner.

No process scans, broad kill commands or shared-service administration. Hashes
identify a PID generation here; they are not tamper-evident security.
"""

import hashlib
import os
import signal
import subprocess
import time


def ownership_scope():
    from django.db import connection

    from litterwatch.runtime import runtime_root

    db = connection.settings_dict
    value = "|".join(
        [str(runtime_root().resolve()), str(db["HOST"]), str(db["PORT"]), str(db["NAME"])]
    )
    return hashlib.sha256(value.encode()).hexdigest()


def identity(pid):
    try:
        value = subprocess.run(
            ["ps", "-ww", "-p", str(pid), "-o", "lstart=", "-o", "command="],
            capture_output=True,
            timeout=2,
            check=False,
        )
        if value.returncode or not value.stdout.strip() or os.getpgid(pid) != pid:
            return None
        return hashlib.sha256(value.stdout.strip()).hexdigest()
    except (OSError, subprocess.TimeoutExpired):
        return None


def reap_registered(record):
    pid, expected = record.get("pid"), record.get("generation")
    if (
        record.get("scope") != ownership_scope()
        or not isinstance(pid, int)
        or not expected
        or identity(pid) != expected
    ):
        return False  # Dead/reused/unknown PID: never signal something else.
    os.killpg(pid, signal.SIGTERM)
    deadline = time.monotonic() + 3
    while time.monotonic() < deadline:
        if identity(pid) != expected:
            return True
        time.sleep(0.1)
    if identity(pid) == expected:
        os.killpg(pid, signal.SIGKILL)
    return True
