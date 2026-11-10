"""Explicit, non-overwriting local bootstrap. Does not start services."""

import argparse
import os
import secrets
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    root = parser.parse_args().directory.absolute()
    os.umask(0o077)
    for directory in [root, root / "secrets", root / "media", root / "input"]:
        directory.mkdir(mode=0o700, parents=True, exist_ok=True)
        if directory.is_symlink() or directory.stat().st_mode & 0o077:
            parser.error("Runtime directories must be private, non-symlink directories (0700)")
    for name in ["django_key", "db_app", "db_admin"]:
        path = root / "secrets" / name
        try:
            with path.open("x") as stream:
                stream.write(secrets.token_urlsafe(48) + "\n")
        except FileExistsError:
            pass  # Never rotate a credential behind an existing DB volume.
    print(f"Private runtime initialized: {root}; existing credentials unchanged")


if __name__ == "__main__":
    main()
