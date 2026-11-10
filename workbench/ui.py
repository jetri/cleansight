"""Minimal local Vite page/assets seam; no API, camera, model or media authority."""

import json
import re
from pathlib import Path

from django.http import Http404, HttpResponse
from django.template import Context, Engine

FRONTEND = Path(__file__).resolve().parent.parent / "frontend"
BUILD = FRONTEND / "dist"
SHELL_CSP = (
    "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; "
    "media-src 'self'; connect-src 'self'; font-src 'self'; object-src 'none'; "
    "base-uri 'none'; frame-ancestors 'none'; form-action 'self'"
)
MIMES = {".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml"}
ASSET_NAME = re.compile(r"assets/[A-Za-z0-9][A-Za-z0-9_.-]*\.(?:js|css|svg)\Z")
MAX_ASSET_BYTES = 2 * 1024 * 1024


def _asset_path(name):
    if not isinstance(name, str) or not (ASSET_NAME.fullmatch(name) or name == "favicon.svg"):
        raise ValueError("Not a supported built UI asset")
    root = BUILD.resolve()
    candidate = (root / name).resolve()
    if not candidate.is_relative_to(root) or not candidate.is_file():
        raise ValueError("Built UI asset unavailable")
    if candidate.stat().st_size > MAX_ASSET_BYTES:
        raise ValueError("Built UI asset exceeds its bound")
    return candidate


def _response(content=b"", *, status=200, content_type="text/html; charset=utf-8"):
    result = HttpResponse(content, status=status, content_type=content_type)
    result["Content-Security-Policy"] = SHELL_CSP
    result["Cache-Control"] = "no-store"
    result["X-Content-Type-Options"] = "nosniff"
    result["X-Frame-Options"] = "DENY"
    return result


def _method_guard(request):
    if request.method in {"GET", "HEAD"}:
        return None
    result = _response(status=405)
    result["Allow"] = "GET, HEAD"
    return result


def shell(request):
    denied = _method_guard(request)
    if denied is not None:
        return denied
    try:
        manifest = json.loads((BUILD / ".vite" / "manifest.json").read_text(encoding="utf-8"))
        entry = manifest["index.html"]
        if entry.get("isEntry") is not True:
            raise ValueError("UI entry missing")
        script = entry["file"]
        styles = entry["css"]
        if not isinstance(styles, list) or not styles or len(styles) > 10:
            raise ValueError("UI styles missing")
        if _asset_path(script).suffix != ".js":
            raise ValueError("UI script invalid")
        for style in styles:
            if _asset_path(style).suffix != ".css":
                raise ValueError("UI stylesheet invalid")
        _asset_path("favicon.svg")
        template = Engine(dirs=[str(FRONTEND / "templates")], autoescape=True).get_template(
            "workspace.html"
        )
        content = template.render(Context({"script": script, "styles": styles}))
    except (OSError, ValueError, KeyError, TypeError, AttributeError):
        content = (
            "<!doctype html><html lang='en'><meta charset='utf-8'>"
            "<title>Evidence Desk - build unavailable</title><h1>UI build unavailable</h1>"
            "<p>Build the local workspace with npm --prefix frontend ci --ignore-scripts "
            "and npm --prefix frontend run build, then reload.</p>"
            "<p>No camera, capture or save state can be inferred from this page.</p></html>"
        )
        result = _response(b"" if request.method == "HEAD" else content, status=503)
        result["Retry-After"] = "5"
        return result
    return _response(b"" if request.method == "HEAD" else content)


def asset(request, name):
    denied = _method_guard(request)
    if denied is not None:
        return denied
    try:
        path = _asset_path(name)
        content = path.read_bytes()
    except (OSError, ValueError):
        raise Http404("Built UI asset unavailable") from None
    result = _response(
        b"" if request.method == "HEAD" else content,
        content_type=f"{MIMES[path.suffix]}; charset=utf-8",
    )
    result["Content-Length"] = str(len(content))
    return result
