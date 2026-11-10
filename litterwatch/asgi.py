"""One ASGI authority; lifespan owns PostgreSQL lease and bounded child supervisor."""

import asyncio
import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "litterwatch.settings")

from django.core.asgi import get_asgi_application  # noqa: E402

http_application = get_asgi_application()
supervisor = None
lease = None


def start():
    global supervisor, lease
    import psycopg
    from django.conf import settings

    from workbench.capture import Supervisor

    db = settings.DATABASES["default"]
    lease = psycopg.connect(
        dbname=db["NAME"],
        user=db["USER"],
        password=db["PASSWORD"],
        host=db["HOST"],
        port=db["PORT"],
        autocommit=True,
        application_name="littering-supervisor",
    )
    if not lease.execute("SELECT pg_try_advisory_lock(740100)").fetchone()[0]:
        lease.close()
        lease = None
        raise RuntimeError("An application supervisor already owns this database")
    try:
        supervisor = Supervisor(lease_check=lambda: lease.execute("SELECT 1"))
        supervisor.start()
    except BaseException:
        lease.close()
        lease = None
        raise


def stop():
    global supervisor, lease
    try:
        if supervisor:
            supervisor.stop()
    finally:
        if lease:
            lease.close()
        lease = None
        supervisor = None


async def application(scope, receive, send):
    if scope["type"] != "lifespan":
        await http_application(scope, receive, send)
        return
    while True:
        message = await receive()
        if message["type"] == "lifespan.startup":
            try:
                await asyncio.to_thread(start)
            except Exception:
                await send(
                    {
                        "type": "lifespan.startup.failed",
                        "message": "Backend startup failed; check DB readiness, migrations and exclusive ownership",
                    }
                )
                return
            await send({"type": "lifespan.startup.complete"})
        elif message["type"] == "lifespan.shutdown":
            await asyncio.to_thread(stop)
            await send({"type": "lifespan.shutdown.complete"})
            return
