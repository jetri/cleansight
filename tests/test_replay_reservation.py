import json
from datetime import timedelta
from threading import Barrier, Thread

import pytest
from django.db import close_old_connections
from django.test import Client
from django.utils import timezone

from workbench.models import Artifact, EvidencePin, ProcessingRun, Segment
from workbench.storage import StoragePressure, pin, pin_replay, sweep


def make_artifacts(count, size=1):
    expiry = timezone.now() + timedelta(hours=1)
    artifacts = [
        Artifact(
            classification="raw_continuous",
            relative_path=f"synthetic-{i}-{timezone.now().timestamp()}.ts",
            mime="video/mp2t",
            byte_size=size,
            sha256="a" * 64,
            expires_at=expiry,
        )
        for i in range(count)
    ]
    return Artifact.objects.bulk_create(artifacts)


@pytest.mark.django_db
@pytest.mark.parametrize("mode", ["media_replay", "observation_fixture"])
def test_hour_replay_reserves_all_inputs_with_existing_pin(fixture_event, mode):
    epoch = fixture_event.epoch
    artifacts = make_artifacts(1801)
    pin(artifacts[-1], "existing", 3600)
    Segment.objects.bulk_create(
        [
            Segment(
                epoch=epoch,
                sequence=i,
                artifact=artifact,
                start_us=i * 2_000_000,
                end_us=(i + 1) * 2_000_000,
                index={},
                arrival_at=timezone.now(),
            )
            for i, artifact in enumerate(artifacts[:-1])
        ]
    )
    response = Client(HTTP_HOST="127.0.0.1").post(
        f"/api/sessions/{epoch.session_id}/replays",
        data=json.dumps({"mode": mode}),
        content_type="application/json",
    )
    assert response.status_code == 201
    run = ProcessingRun.objects.get(pk=response.json()["data"]["id"])
    assert run.configuration_id == epoch.session.configuration_id
    assert len(run.input_manifest["segments"]) == 1800
    assert EvidencePin.objects.filter(purpose="replay-input").count() == 1800
    assert (
        EvidencePin.objects.filter(purpose="replay-input").values("replay_group").distinct().count()
        == 1
    )


@pytest.mark.django_db
def test_protected_bytes_failure_is_atomic_and_expiry_allows_sweep(private_runtime, monkeypatch):
    first, second = make_artifacts(2, size=6)
    monkeypatch.setenv("LITTERING_QUOTA_BYTES", "10")
    hold = pin(first, "existing", 3600)
    with pytest.raises(StoragePressure):
        pin(second, "other", 3600)
    assert EvidencePin.objects.count() == 1
    first.expires_at = timezone.now() - timedelta(seconds=1)
    first.save(update_fields=["expires_at"])
    assert sweep() == 0
    hold.expires_at = timezone.now() - timedelta(seconds=1)
    hold.save(update_fields=["expires_at"])
    assert sweep() == 1
    assert pin(second, "other", 3600).artifact_id == second.id


@pytest.mark.django_db
def test_replay_group_admission_is_atomic_at_shared_limits(monkeypatch):
    artifacts = make_artifacts(3, size=6)
    monkeypatch.setenv("LITTERING_QUOTA_BYTES", "12")
    pin(artifacts[0], "existing", 3600)
    with pytest.raises(StoragePressure):
        pin_replay(artifacts[1:])
    assert EvidencePin.objects.count() == 1
    group = pin_replay([artifacts[1]])
    assert len(group) == 1
    EvidencePin.objects.bulk_create(
        [
            EvidencePin(
                artifact=artifacts[0],
                purpose="existing",
                expires_at=timezone.now() + timedelta(hours=1),
            )
            for _ in range(998)
        ]
    )
    with pytest.raises(StoragePressure):
        pin_replay([artifacts[1]])
    assert EvidencePin.objects.count() == 1000


@pytest.mark.django_db(transaction=True)
@pytest.mark.parametrize("limit", ["slots", "bytes"])
def test_concurrent_group_and_pin_admission(private_runtime, monkeypatch, limit):
    first, second = make_artifacts(2, size=6)
    if limit == "slots":
        EvidencePin.objects.bulk_create(
            [
                EvidencePin(
                    artifact=first,
                    purpose="existing",
                    expires_at=timezone.now() + timedelta(hours=1),
                )
                for _ in range(999)
            ]
        )
    else:
        monkeypatch.setenv("LITTERING_QUOTA_BYTES", "10")
    barrier = Barrier(2)
    outcomes = []

    def reserve(artifact, grouped):
        close_old_connections()
        try:
            barrier.wait(timeout=10)
            if grouped:
                pin_replay([artifact])
            else:
                pin(artifact, "concurrent", 3600)
            outcomes.append("accepted")
        except StoragePressure:
            outcomes.append("rejected")
        finally:
            close_old_connections()

    threads = [
        Thread(target=reserve, args=(first, True)),
        Thread(target=reserve, args=(second, False)),
    ]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=20)
    assert sorted(outcomes) == ["accepted", "rejected"]
    assert EvidencePin.objects.count() == (1000 if limit == "slots" else 1)
