from django.urls import include, path

from workbench import views

urlpatterns = [
    path("api/health", views.health),
    path("api/cameras", views.cameras),
    path("api/cameras/<uuid:identity>", views.camera_detail),
    path("api/cameras/<uuid:identity>/configurations", views.configurations),
    path("api/cameras/<uuid:identity>/recording", views.recording),
    path("api/sessions", views.sessions),
    path("api/sessions/<uuid:identity>", views.session_detail),
    path("api/sessions/<uuid:identity>/replays", views.replays),
    path("api/runs", views.runs),
    path("api/events", views.event_queue),
    path("api/runs/<uuid:identity>/events", views.events),
    path("api/runs/<uuid:identity>/timeline", views.timeline),
    path("api/events/<uuid:identity>", views.event_detail),
    path("api/events/<uuid:identity>/transitions", views.transitions),
    path("api/events/<uuid:identity>/reviews", views.reviews),
    path("api/events/<uuid:identity>/clips", views.clips),
    path("api/clips/<uuid:identity>", views.clip_detail),
    path("api/artifacts/<uuid:identity>", views.artifact_detail),
    path("api/artifacts/<uuid:identity>/pins", views.pins),
    path("api/segments/<uuid:identity>/frames", views.frames),
    path("api/frames/<uuid:identity>", views.frame_detail),
    path("media/<uuid:identity>", views.media),
    path("", include("workbench.ui_urls")),
]
