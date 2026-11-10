"""Isolated Django shell/view units, not assembled backend/PostgreSQL E2E."""

import json
from types import SimpleNamespace

import django
import pytest
from django.apps import apps
from django.conf import settings
from django.http import Http404
from django.urls import Resolver404, resolve

if not settings.configured:
    settings.configure(DEFAULT_CHARSET="utf-8", INSTALLED_APPS=[], USE_I18N=False)
if not apps.ready:
    django.setup()

from workbench import ui, ui_urls  # noqa: E402


def request(method="GET"):
    return SimpleNamespace(method=method)


@pytest.fixture
def build(tmp_path, monkeypatch):
    (tmp_path / "assets").mkdir()
    (tmp_path / ".vite").mkdir()
    (tmp_path / "assets" / "index-test.js").write_text("export {};", encoding="utf-8")
    (tmp_path / "assets" / "index-test.css").write_text("body { margin: 0; }", encoding="utf-8")
    (tmp_path / "favicon.svg").write_text(
        "<svg xmlns='http://www.w3.org/2000/svg'/>", encoding="utf-8"
    )
    manifest = {
        "index.html": {
            "isEntry": True,
            "file": "assets/index-test.js",
            "css": ["assets/index-test.css"],
        }
    }
    (tmp_path / ".vite" / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    monkeypatch.setattr(ui, "BUILD", tmp_path)
    return tmp_path


def test_actual_current_vite_build_renders_in_real_django():
    # npm run build is a deliberate prerequisite, never a silent passing skip.
    response = ui.shell(request())
    assert response.status_code == 200
    assert b'<div id="root"></div>' in response.content
    assert b'type="module" src="/ui-assets/assets/' in response.content
    assert b'rel="stylesheet" href="/ui-assets/assets/' in response.content
    assert b"csrf_token" not in response.content
    assert "'unsafe-inline'" not in response["Content-Security-Policy"]
    assert "'unsafe-eval'" not in response["Content-Security-Policy"]
    assert response["Cache-Control"] == "no-store"


def test_shell_uses_manifest_and_preserves_strict_local_policy(build):
    response = ui.shell(request())
    assert response.status_code == 200
    assert b"/ui-assets/assets/index-test.js" in response.content
    assert b"/ui-assets/assets/index-test.css" in response.content
    assert response["Content-Security-Policy"] == ui.SHELL_CSP
    assert response["X-Content-Type-Options"] == "nosniff"
    assert response["X-Frame-Options"] == "DENY"
    assert ui.shell(request("HEAD")).content == b""


def test_missing_or_invalid_build_is_503_not_a_static_design_fallback(build):
    manifest = build / ".vite" / "manifest.json"
    for content in [
        "{",
        "[]",
        "{}",
        '{"index.html":{"isEntry":true,"file":"https://remote.invalid/a.js","css":[]}}',
    ]:
        manifest.write_text(content, encoding="utf-8")
        response = ui.shell(request())
        assert response.status_code == 503
        assert b"UI build unavailable" in response.content
        assert b"No camera, capture or save state" in response.content
        assert response["Retry-After"] == "5"
    manifest.unlink()
    assert ui.shell(request()).status_code == 503


def test_asset_get_head_and_mime_are_bounded_local_build_only(build):
    response = ui.asset(request(), "assets/index-test.js")
    assert response.status_code == 200
    assert response.content == b"export {};"
    assert response["Content-Type"] == "text/javascript; charset=utf-8"
    head = ui.asset(request("HEAD"), "assets/index-test.js")
    assert head.content == b""
    assert head["Content-Length"] == str(len(response.content))
    assert ui.asset(request(), "favicon.svg")["Content-Type"].startswith("image/svg+xml")


@pytest.mark.parametrize(
    "name",
    [
        "../runtime/key",
        "assets/../outside.js",
        "assets/.env",
        "assets/index-test.js?token=synthetic",
        "https://remote.invalid/file.js",
        "assets/continuous.mp4",
        ".vite/manifest.json",
    ],
)
def test_asset_route_is_not_a_filesystem_or_raw_media_mount(build, name):
    with pytest.raises(Http404, match="Built UI asset unavailable"):
        ui.asset(request(), name)


def test_symlink_escape_and_oversized_asset_are_unavailable(build):
    outside = build.parent / "outside-test-only.js"
    outside.write_text("synthetic outside fixture", encoding="utf-8")
    (build / "assets" / "escape.js").symlink_to(outside)
    with pytest.raises(Http404):
        ui.asset(request(), "assets/escape.js")
    (build / "assets" / "oversized.js").write_bytes(b"x" * (ui.MAX_ASSET_BYTES + 1))
    with pytest.raises(Http404):
        ui.asset(request(), "assets/oversized.js")


def test_page_and_assets_reject_unsafe_methods(build):
    for response in [ui.shell(request("POST")), ui.asset(request("POST"), "assets/index-test.js")]:
        assert response.status_code == 405
        assert response["Allow"] == "GET, HEAD"


def test_minimal_url_seam_does_not_capture_api_or_media_routes():
    assert resolve("/", urlconf=ui_urls).func is ui.shell
    assert resolve("/ui-assets/assets/index-test.js", urlconf=ui_urls).kwargs == {
        "name": "assets/index-test.js"
    }
    for path in ["/api/health", "/media/synthetic-id", "/arbitrary-filesystem-path"]:
        with pytest.raises(Resolver404):
            resolve(path, urlconf=ui_urls)
