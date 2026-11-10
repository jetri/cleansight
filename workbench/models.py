"""Authoritative metadata. Immutable rows also have PostgreSQL mutation guards.

These are local provenance records, not authenticated/tamper-evident audit.
All source positions are integer microseconds WITHIN an explicitly identified epoch.
"""

import uuid

from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q


class Record(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        abstract = True


class Immutable(Record):
    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise ValidationError("Historical records cannot be rewritten")
        return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError("Historical records cannot be deleted")

    class Meta:
        abstract = True


class Camera(Record):
    name = models.CharField(max_length=120)
    kind = models.CharField(
        max_length=20, choices=[("rtsp", "RTSP"), ("file_fixture", "SYNTHETIC FILE FIXTURE")]
    )
    secret_ref = models.CharField(max_length=80)
    permission_ref = models.CharField(max_length=200)
    data_provenance = models.CharField(max_length=30, default="unclassified")
    desired_recording = models.BooleanField(default=False)
    active_revision = models.ForeignKey(
        "Configuration", null=True, on_delete=models.PROTECT, related_name="active_for"
    )


class Configuration(Immutable):
    camera = models.ForeignKey(Camera, on_delete=models.PROTECT, related_name="revisions")
    sequence = models.PositiveIntegerField()
    geometry = models.JSONField()
    settings = models.JSONField(default=dict)
    digest = models.CharField(max_length=64)
    activated_at = models.DateTimeField()
    activation_watermark = models.JSONField(default=dict)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["camera", "sequence"], name="configuration_sequence")
        ]


class CaptureSession(Record):
    camera = models.ForeignKey(Camera, on_delete=models.PROTECT, related_name="sessions")
    configuration = models.ForeignKey(Configuration, on_delete=models.PROTECT)
    provenance = models.CharField(max_length=30)
    status = models.CharField(max_length=30, default="connecting")
    stopped_at = models.DateTimeField(null=True)
    health = models.JSONField(default=dict)
    child_identity = models.JSONField(default=dict)  # Internal, never an HTTP media endpoint.


class Epoch(Immutable):
    session = models.ForeignKey(CaptureSession, on_delete=models.PROTECT, related_name="epochs")
    sequence = models.PositiveIntegerField()
    reason = models.CharField(max_length=80)
    # First decoded PTS is retained in raw units in each segment's index.
    arrival_anchor = models.DateTimeField()
    mapping = models.CharField(max_length=80, default="arrival_anchored_network_delay_unknown")

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["session", "sequence"], name="epoch_sequence")
        ]


class Artifact(Record):
    classification = models.CharField(
        max_length=30,
        choices=[
            ("raw_continuous", "RAW"),
            ("derived_unredacted", "UNREDACTED CLIP"),
            ("frame_unredacted", "UNREDACTED FRAME"),
        ],
    )
    relative_path = models.CharField(max_length=200, unique=True)
    mime = models.CharField(max_length=60)
    byte_size = models.PositiveBigIntegerField()
    sha256 = models.CharField(max_length=64)
    status = models.CharField(max_length=20, default="available")
    expires_at = models.DateTimeField()
    lineage = models.JSONField(default=list)
    metadata = models.JSONField(default=dict)
    deleted_at = models.DateTimeField(null=True)


class Segment(Immutable):
    epoch = models.ForeignKey(Epoch, on_delete=models.PROTECT, related_name="segments")
    sequence = models.PositiveIntegerField()
    artifact = models.OneToOneField(Artifact, on_delete=models.PROTECT)
    start_us = models.BigIntegerField()
    end_us = models.BigIntegerField()
    index = models.JSONField()  # timebase, original PTS, source-indexed frame timestamps
    arrival_at = models.DateTimeField()

    class Meta:
        ordering = ["start_us"]
        constraints = [
            models.UniqueConstraint(fields=["epoch", "sequence"], name="segment_sequence"),
            models.CheckConstraint(
                condition=Q(end_us__gt=models.F("start_us")), name="segment_positive_span"
            ),
        ]


class CoverageGap(Immutable):
    session = models.ForeignKey(CaptureSession, on_delete=models.PROTECT, related_name="gaps")
    epoch = models.ForeignKey(Epoch, null=True, on_delete=models.PROTECT)
    start_us = models.BigIntegerField(null=True)
    end_us = models.BigIntegerField(null=True)
    reason = models.CharField(max_length=80)
    ended_at = models.DateTimeField(null=True)  # UTC uncertainty, NOT cross-epoch duration


class ProcessingRun(Immutable):
    session = models.ForeignKey(CaptureSession, on_delete=models.PROTECT, related_name="runs")
    configuration = models.ForeignKey(Configuration, on_delete=models.PROTECT)
    mode = models.CharField(max_length=30, default="observation_fixture")
    input_manifest = models.JSONField()
    versions = models.JSONField()


class FixtureEvent(Immutable):
    run = models.ForeignKey(ProcessingRun, on_delete=models.PROTECT, related_name="events")
    epoch = models.ForeignKey(Epoch, on_delete=models.PROTECT)
    release_key = models.CharField(max_length=100)
    release_us = models.BigIntegerField()
    label = models.CharField(max_length=80, default="OBSERVATION FIXTURE - NOT MODEL EVIDENCE")

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["run", "release_key"], name="event_idempotency")
        ]


class Transition(Immutable):
    event = models.ForeignKey(FixtureEvent, on_delete=models.PROTECT, related_name="transitions")
    sequence = models.PositiveIntegerField()
    previous = models.CharField(max_length=40)
    state = models.CharField(max_length=40)
    source_us = models.BigIntegerField()
    reason = models.CharField(max_length=100)
    evidence = models.JSONField(default=dict)
    provenance = models.CharField(max_length=30, default="observation_fixture")
    processing_at = models.DateTimeField()

    class Meta:
        ordering = ["sequence"]
        constraints = [
            models.UniqueConstraint(fields=["event", "sequence"], name="transition_sequence")
        ]


class Review(Immutable):
    event = models.ForeignKey(FixtureEvent, on_delete=models.PROTECT, related_name="reviews")
    state = models.CharField(max_length=30)
    reason = models.CharField(max_length=100)
    notes = models.TextField(blank=True)
    reviewer_label = models.CharField(max_length=100)
    supersedes = models.OneToOneField("self", null=True, on_delete=models.PROTECT)


class FrameJob(Record):
    segment = models.ForeignKey(Segment, on_delete=models.PROTECT)
    requested_us = models.BigIntegerField()
    status = models.CharField(max_length=20, default="queued")
    artifact = models.ForeignKey(Artifact, null=True, on_delete=models.PROTECT)
    reason = models.CharField(max_length=80, blank=True)


class EvidencePin(Record):
    artifact = models.ForeignKey(Artifact, on_delete=models.PROTECT, related_name="pins")
    purpose = models.CharField(max_length=100)
    expires_at = models.DateTimeField()
    released_at = models.DateTimeField(null=True)


class ClipJob(Record):
    event = models.ForeignKey(FixtureEvent, on_delete=models.PROTECT, related_name="clips")
    revision = models.PositiveIntegerField()
    start_us = models.BigIntegerField()
    end_us = models.BigIntegerField()
    required_start_us = models.BigIntegerField()
    required_end_us = models.BigIntegerField()
    status = models.CharField(max_length=30, default="queued")
    coverage = models.JSONField(default=dict)
    artifacts = models.ManyToManyField(Artifact, related_name="clip_jobs")

    class Meta:
        constraints = [models.UniqueConstraint(fields=["event", "revision"], name="clip_revision")]
