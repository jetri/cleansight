"""Include from the existing Django URL list; API/media routes stay unchanged."""

from django.urls import path

from .ui import asset, shell

urlpatterns = [
    path("", shell, name="workspace"),
    path("ui-assets/<path:name>", asset, name="workspace-asset"),
]
