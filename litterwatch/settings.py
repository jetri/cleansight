import os

from .runtime import read_secret

SECRET_KEY = read_secret("django_key")
DEBUG = False
ALLOWED_HOSTS = ["127.0.0.1", "localhost", "[::1]"]
INSTALLED_APPS = ["workbench"]
MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "workbench.middleware.LocalOnlyMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
]
ROOT_URLCONF = "litterwatch.urls"
ASGI_APPLICATION = "litterwatch.asgi.application"
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.environ.get("LITTERING_DB_NAME", "littering"),
        "USER": "littering_app",
        "PASSWORD": read_secret("db_app"),
        "HOST": "127.0.0.1",
        "PORT": os.environ.get("LITTERING_DB_PORT", "55432"),
        "CONN_MAX_AGE": 0,
        "OPTIONS": {"connect_timeout": 5},
        "TEST": {"NAME": "test_littering"},
    }
}
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
USE_TZ = True
TIME_ZONE = "UTC"
DATA_UPLOAD_MAX_MEMORY_SIZE = 64 * 1024
CSRF_FAILURE_VIEW = "workbench.views.csrf_failure"
CSRF_COOKIE_SAMESITE = "Strict"
SESSION_COOKIE_SAMESITE = "Strict"
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = "DENY"
# No admin/auth UI, external APIs, model runtime, CORS exemptions or static media mount.
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"null": {"class": "logging.NullHandler"}},
    "loggers": {"django.request": {"handlers": ["null"], "propagate": False}},
}
