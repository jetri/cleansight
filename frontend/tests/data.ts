// Permission-safe synthetic DTOs for isolated tests, never normal product data.
import type { Artifact, BackendHealth, Camera, Clip, Configuration, IndexedFrame, RunSummary, Session, StoredEvent, Timeline } from '../src/api/types';

export const uuid = (number: number) => `${number.toString(16).padStart(8, '0')}-0000-4000-8000-${number.toString(16).padStart(12, '0')}`;
export const health: BackendHealth = { status: 'local_backend_only', supervisor: null, csrf_token: 'explicit-unit-test-csrf-token', sources: 1, ui: 'not_implemented', detector: 'not_implemented' };
export const camera: Camera = { id: uuid(1), name: 'Synthetic source A', kind: 'file_fixture', secret_ref: 'synthetic-source', permission_ref: 'synthetic-permission', data_provenance: 'synthetic', desired_recording: false, active_revision: uuid(2) };
export const configuration: Configuration = {
  id: uuid(2), sequence: 1,
  geometry: { zones: [{ name: 'Ground', points: [[0, .4], [1, .4], [1, 1], [0, 1]] }], exclusions: [{ name: 'Exclude', points: [[.7, .5], [.9, .5], [.9, .8], [.7, .8]] }], boundary: .01 },
  settings: { segment_seconds: 2, retention_seconds: 3600 }, digest: 'fixture-configuration-digest', activated_at: '2026-11-10T09:00:00Z', activation_watermark: {},
};
export const session: Session = {
  id: uuid(3), camera: camera.id, configuration: configuration.id, provenance: 'synthetic', status: 'stopped', started_at: '2026-11-10T09:00:00Z', stopped_at: '2026-11-10T09:01:00Z',
  health: { transport: 'stopped', recording: 'stopped', processing: 'not_implemented', captured_through: { epoch: uuid(4), source_us: 60_000_000 }, preview: 'unavailable' },
  epochs: [{ id: uuid(4), sequence: 1, reason: 'synthetic_fixture', arrival_anchor: '2026-11-10T09:00:00Z', mapping: 'source_clock' }], gaps: [],
};
export const run: RunSummary = { id: uuid(5), session_id: session.id, configuration_id: configuration.id, mode: 'observation_fixture', created_at: '2026-11-10T09:02:00Z', versions: { detector: 'not_implemented', fixture: true } };
export const clip: Clip = {
  id: uuid(7), revision: 1, status: 'available', requested: [0, 60_000_000], required: [15_000_000, 45_000_000],
  coverage: { available: [[0, 60_000_000]], missing: [], required_missing: [], parts: [uuid(8)], reason: 'complete_recorded_coverage_not_visual_evidence' }, media: [uuid(8)],
};
export const artifact: Artifact = {
  id: uuid(8), classification: 'derived_unredacted', status: 'available', mime: 'video/mp4', byte_size: 1024, sha256: 'a'.repeat(64), lineage: [uuid(9)],
  metadata: { epoch: uuid(4), source_span_us: [0, 60_000_000], index: { start_us: 0 }, fixture: true, redacted: false }, expires_at: '2026-12-01T00:00:00Z', pins: [],
};
export function eventFixture(number = 6, outcome = 'UNCERTAIN'): StoredEvent {
  const media = uuid(number + 2);
  const eventClip = { ...structuredClone(clip), id: uuid(number + 1), media: [media], coverage: { ...structuredClone(clip.coverage), parts: [media] } };
  return { id: uuid(number), run: run.id, configuration: configuration.id, epoch: uuid(4), release_us: 15_000_000, label: 'OBSERVATION FIXTURE - NOT MODEL EVIDENCE', phase: 'final', machine_outcome: outcome,
    transitions: [{ id: uuid(number + 100), sequence: 1, previous: 'NO_EVENT', state: outcome, source_us: 16_000_000, reason: 'synthetic_ambiguous_pixels', evidence: { fixture: true, required_span_us: [15_000_000, 45_000_000] }, provenance: 'observation_fixture', processing_at: '2026-11-10T09:02:01Z', created_at: '2026-11-10T09:02:01Z' }], reviews: [], clips: [eventClip],
  };
}
export const frame: IndexedFrame = { epoch: uuid(4), segment: uuid(9), frame: 0, source_us: 15_000_000, raw_pts: 150, time_base: '1/10' };
export const timeline: Timeline = { run: run.id, mode: 'observation_fixture', frames: [frame, { ...frame, frame: 1, source_us: 15_100_000, raw_pts: 151 }], next: null, clock: 'epoch_source_microseconds_not_wall_time', gaps: [] };
