import copy
from datetime import timedelta

import pytest
from django.core.exceptions import ImproperlyConfigured, ValidationError
from django.db import IntegrityError, connection, transaction
from django.utils import timezone

from litterwatch.runtime import read_secret
from workbench import services
from workbench.geometry import classify_point, validate_geometry
from workbench.models import (
    Artifact,
    Configuration,
    CoverageGap,
    Epoch,
    FixtureEvent,
    ProcessingRun,
    Review,
    Transition,
)
from workbench.storage import StoragePressure, artifact_path, pin, publish, reconcile, sweep
from workbench.views import BoundedReader, parse_range

from .conftest import GEOMETRY


@pytest.mark.parametrize(
    "point,outcome",
    [
        ((0.5, 0.5), "inside"),
        ((0.8, 0.8), "excluded"),
        ((0, 0.5), "boundary"),
        ((1.2, 0.5), "outside"),
    ],
)
def test_exclusions_and_boundaries(point, outcome):
    assert classify_point(GEOMETRY, *point) == outcome


@pytest.mark.parametrize(
    "points",
    [
        [[0, 0], [1, 1], [1, 0], [0, 1]],
        [[0, 0], [float("nan"), 1], [1, 0]],
        [[0, 0], [1, 0]],
        [[0, 0], [True, 1], [1, 0]],
    ],
)
def test_invalid_geometry(points):
    geometry = copy.deepcopy(GEOMETRY)
    geometry["zones"][0]["points"] = points
    with pytest.raises(ValidationError):
        validate_geometry(geometry)


def test_overlapping_zone_ambiguity():
    geometry = copy.deepcopy(GEOMETRY)
    geometry["zones"].append(
        {"name": "duplicate-space", "points": [[0.1, 0.1], [0.5, 0.1], [0.5, 0.5]]}
    )
    with pytest.raises(ValidationError, match="overlap"):
        validate_geometry(geometry)


def test_pinned_history_and_separate_reviews(fixture_event):
    event = fixture_event
    old_revision = event.run.configuration
    new_revision = services.configure(event.run.session.camera, GEOMETRY, {"segment_seconds": 3})
    assert old_revision.id != new_revision.id
    event.refresh_from_db()
    assert event.run.configuration_id == old_revision.id
    first = services.transition(
        event, 1, "INTERACTION_CANDIDATE", 19_000_000, "injected fixture", {"observed": False}
    )
    assert (
        services.transition(event, 1, first.state, first.source_us, first.reason, first.evidence).id
        == first.id
    )
    with pytest.raises(ValidationError):
        services.transition(event, 1, first.state, first.source_us, "different", {})
    services.transition(event, 2, "UNCERTAIN", 21_000_000, "fixture ambiguity", {})
    original = services.review(
        event, "confirmed", "human fixture review", "note", "local-unverified-label"
    )
    services.review(event, "rejected", "correction", "new note", "another-local-label", original)
    assert event.transitions.last().state == "UNCERTAIN"
    assert event.reviews.count() == 2
    assert (
        services.create_fixture(event.run, event.epoch, event.release_key, event.release_us).id
        == event.id
    )
    with pytest.raises(ValidationError):
        services.create_fixture(event.run, event.epoch, event.release_key, 22_000_000)
    for model in [Configuration, Epoch, FixtureEvent, ProcessingRun, Transition, Review]:
        record = model.objects.first()
        with pytest.raises(IntegrityError), transaction.atomic():
            model.objects.filter(pk=record.pk).update(created_at=timezone.now())
    assert event.transitions.count() == 2


def test_fixture_transition_safety(fixture_event):
    for state, seq, source in [
        ("RELEASE_CANDIDATE", 1, 20_000_000),
        ("AUTOMATIC_ALERT", 1, 20_000_000),
        ("WOULD_ALERT", 1, 20_000_000),
        ("INTERACTION_CANDIDATE", 2, 20_000_000),
    ]:
        with pytest.raises(ValidationError):
            services.transition(fixture_event, seq, state, source, "fixture", {})
    services.transition(fixture_event, 1, "INTERACTION_CANDIDATE", 20_000_000, "fixture", {})
    with pytest.raises(ValidationError):
        services.transition(fixture_event, 2, "RELEASE_CANDIDATE", 19_000_000, "time reversal", {})


def test_restart_marks_unverified_not_negative(fixture_event):
    services.transition(fixture_event, 1, "INTERACTION_CANDIDATE", 19_000_000, "fixture", {})
    services.interrupt_sessions()
    services.interrupt_sessions()  # Already interrupted history is not duplicated.
    fixture_event.refresh_from_db()
    assert fixture_event.transitions.last().state == "INCOMPLETE"
    assert fixture_event.transitions.last().source_us == 19_000_000
    assert CoverageGap.objects.count() == 1
    assert fixture_event.run.session.stopped_at


def test_db_application_role_is_not_superuser_or_database_creator(db):
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT rolsuper, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname=current_user"
        )
        assert cursor.fetchone() == (False, False, False)
    assert connection.vendor == "postgresql"


def test_two_source_limit(db):
    for name in ["a", "b"]:
        services.create_camera(name, "file_fixture", name, "synthetic")
    with pytest.raises(ValidationError):
        services.create_camera("third", "file_fixture", "third", "synthetic")


def test_secret_reference_permissions_and_no_path_traversal(private_runtime):
    path = private_runtime / "secrets" / "test_secret"
    path.write_text("canary-value\n")
    path.chmod(0o600)
    assert read_secret("test_secret") == "canary-value"
    for ref in ["../db_app", "/etc/passwd", "http://bad", "missing"]:
        with pytest.raises(ImproperlyConfigured):
            read_secret(ref)
    path.chmod(0o644)
    with pytest.raises(ImproperlyConfigured):
        read_secret("test_secret")
    path.unlink()
    path.symlink_to(private_runtime / "secrets" / "db_app")
    with pytest.raises(ImproperlyConfigured):
        read_secret("test_secret")


def test_retention_pins_quota_and_missing(db, private_runtime, monkeypatch):
    staging = private_runtime / "media" / "temporary.jpg"
    staging.write_bytes(b"fixture-only")
    artifact = publish(staging, "frame_unredacted", "image/jpeg", ttl_seconds=1)
    hold = pin(artifact, "retained-evaluation-fixture", 3600)
    Artifact.objects.filter(pk=artifact.pk).update(expires_at=timezone.now() - timedelta(seconds=1))
    assert sweep() == 0 and artifact_path(artifact).exists()
    monkeypatch.setenv("LITTERING_QUOTA_BYTES", "1")
    with pytest.raises(StoragePressure):
        from workbench.storage import budget

        budget()
    assert artifact_path(artifact).exists()  # Never delete a pin to make room.
    hold.released_at = timezone.now()
    hold.save(update_fields=["released_at"])
    assert sweep() == 1 and not artifact_path(artifact).exists()
    monkeypatch.setenv("LITTERING_QUOTA_BYTES", "1000000")
    staging.write_bytes(b"fixture-only")
    other = publish(staging, "frame_unredacted", "image/jpeg")
    artifact_path(other).unlink()
    reconcile()
    other.refresh_from_db()
    assert other.status == "missing"


def test_catalog_path_does_not_expose_filesystem(db, private_runtime):
    staging = private_runtime / "media" / "temporary.jpg"
    staging.write_bytes(b"fixture-only")
    artifact = publish(staging, "frame_unredacted", "image/jpeg")
    artifact.relative_path = "../secrets/db_app"
    with pytest.raises(ValidationError):
        artifact_path(artifact)
    artifact.relative_path = "symlink.jpg"
    (private_runtime / "media" / "symlink.jpg").symlink_to(private_runtime / "secrets" / "db_app")
    with pytest.raises(ValidationError):
        artifact_path(artifact)


@pytest.mark.parametrize(
    "header,result",
    [
        (None, (0, 99, False)),
        ("bytes=10-19", (10, 19, True)),
        ("bytes=-10", (90, 99, True)),
        ("bytes=90-", (90, 99, True)),
        ("bytes=80-500", (80, 99, True)),
    ],
)
def test_single_range(header, result):
    assert parse_range(header, 100) == result


@pytest.mark.parametrize(
    "header", ["bytes=", "bytes=-0", "bytes=100-", "bytes=90-80", "bytes=0-1,3-4", "items=0-10"]
)
def test_rejected_ranges(header):
    with pytest.raises(ValueError):
        parse_range(header, 100)


def test_media_descriptor_closed_even_without_iteration(tmp_path, db):
    from django.http import StreamingHttpResponse

    path = tmp_path / "data"
    path.write_bytes(b"data")
    import os

    reader = BoundedReader(os.open(path, os.O_RDONLY), 0, 4)
    result = StreamingHttpResponse(reader)
    result.close()
    assert reader.file.closed
