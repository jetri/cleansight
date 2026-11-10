"""Combined URL/middleware contract, not physical-camera or browser acceptance."""

import re

import pytest
from django.test import Client

from workbench import ui


@pytest.mark.django_db
def test_same_origin_workspace_assets_and_csrf_protected_api():
    # A real production build is a prerequisite, never a silent passing skip.
    client = Client(enforce_csrf_checks=True, HTTP_HOST="127.0.0.1:8000")
    shell = client.get("/")
    assert shell.status_code == 200
    assert shell["Content-Security-Policy"] == ui.SHELL_CSP
    assert shell["Cache-Control"] == "no-store"
    assert b'<div id="root"></div>' in shell.content
    assets = re.findall(rb'(?:src|href)="(/ui-assets/[^\"]+)"', shell.content)
    assert assets
    for url in assets:
        asset = client.get(url.decode())
        assert asset.status_code == 200
        assert asset["X-Content-Type-Options"] == "nosniff"
    health = client.get("/api/health").json()["data"]
    assert health["status"] == "local_workbench"
    assert health["ui"] == "django_shell"  # Routing, not asset/camera readiness.
    assert health["detector"] == "not_implemented"
    assert client.post("/api/cameras", {}, content_type="application/json").status_code == 403
    cameras = client.get("/api/cameras").json()
    assert cameras["data"] == []
    assert cameras["production_activation"] == "disabled"
    assert client.get("/ui-assets/../manage.py").status_code == 404
    assert client.get("/media/00000000-0000-0000-0000-000000000000").status_code == 404
