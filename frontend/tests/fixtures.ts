import type { WorkbenchApi } from '../src/api/client';
import { vi } from 'vitest';
import { artifact, camera, clip, configuration, eventFixture, health, run, session, timeline, uuid } from './data';
export * from './data';

/** Injectable client fixture for isolated UI tests only, not HTTP/E2E proof. */
export function mockApi(overrides: Partial<WorkbenchApi> = {}): WorkbenchApi {
  return {
    health: vi.fn(async () => structuredClone(health)), cameras: vi.fn(async () => [structuredClone(camera)]),
    sessions: vi.fn(async () => [structuredClone(session)]), runs: vi.fn(async () => [structuredClone(run)]),
    configurations: vi.fn(async () => [structuredClone(configuration)]), queue: vi.fn(async () => [eventFixture()]), event: vi.fn(async id => eventFixture(Number.parseInt(id.slice(-12), 16))),
    createCamera: vi.fn(async input => ({ ...camera, ...input, id: uuid(50), active_revision: null, desired_recording: false })), editCamera: vi.fn(async (id, input) => ({ ...camera, ...input, id })),
    configure: vi.fn(async (_id, geometry, settings) => ({ ...configuration, id: uuid(51), sequence: 2, geometry, settings })),
    recording: vi.fn(async (_id, enabled) => ({ ...camera, desired_recording: enabled })),
    replay: vi.fn(async (id, mode) => ({ id: uuid(52), mode, configuration: configuration.id, input_manifest: { session: id, segments: [], gaps: [], clock: 'epoch_source_microseconds_not_wall_time' }, versions: {} })),
    events: vi.fn(async () => [eventFixture()]),
    review: vi.fn(async (id, input) => ({ ...eventFixture(Number.parseInt(id.slice(-12), 16)), reviews: [{ id: uuid(53), state: input.state, reason: input.reason, notes: input.notes, reviewer_label: input.reviewer_label, supersedes_id: input.supersedes ?? null, created_at: '2026-11-10T09:03:00Z' }] })),
    requestClip: vi.fn(async () => structuredClone(clip)), clip: vi.fn(async () => structuredClone(clip)),
    artifact: vi.fn(async id => ({ ...structuredClone(artifact), id, ...(id === uuid(56) ? { mime: 'image/jpeg', classification: 'frame_unredacted', metadata: { epoch: uuid(4), source_us: 15_000_000, fixture: true, redacted: false } } : {}) })),
    pin: vi.fn(async () => ({ id: uuid(54), expires_at: '2026-11-10T11:00:00Z' })),
    timeline: vi.fn(async () => structuredClone(timeline)), requestFrame: vi.fn(async () => ({ id: uuid(55), status: 'queued' })), frame: vi.fn(async () => ({ id: uuid(55), status: 'available', media: uuid(56), source_us: 15_000_000 })),
    ...overrides,
  };
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
