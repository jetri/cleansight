"""Supported backend launch always binds loopback, one process, no reload children."""

import argparse
import os

import uvicorn

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--port", type=int, default=8000)
args = parser.parse_args()
os.umask(0o077)
uvicorn.run(
    "litterwatch.asgi:application",
    host="127.0.0.1",
    port=args.port,
    workers=1,
    lifespan="on",
    access_log=False,
    log_level="warning",
)
