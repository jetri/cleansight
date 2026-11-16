// Explicit HTTP-mocked browser fixture. Not a Django/database/media-pipeline test.
// Only lavfi color patterns are generated; no camera, person or private input.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page, Route } from '@playwright/test';
import type { Artifact, Camera, Configuration, Geometry, ReviewState, RunSummary, Session, StoredEvent } from '../../src/api/types';
import { artifact, camera, configuration, eventFixture, health, run, session, uuid } from '../data';

export const shellCsp = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; media-src 'self'; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'";
export interface MockState {
  cameras: Camera[]; sessions: Session[]; runs: RunSummary[]; events: StoredEvent[]; configurations: Configuration[];
  calls: { method: string; path: string; body: Record<string, unknown> }[];
  unhandled: string[]; loseCameraAcknowledgement: boolean; failReviewOnce: boolean; loseReviewAcknowledgement: boolean;
  unavailableMedia: boolean; failGeometryOnce: boolean; loseGeometryAcknowledgement: boolean; loseReplayAcknowledgement: boolean; reviewResponseWait: Promise<void> | null;
}
const now = () => new Date().toISOString();
const string = (value: unknown) => typeof value === 'string' ? value : '';

export async function installMockHttp(page: Page, directory: string): Promise<MockState> {
  mkdirSync(directory, { recursive: true });
  const videoPath = join(directory, 'synthetic-pattern.mp4');
  execFileSync('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=320x240:rate=10', '-t', '8', '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', videoPath], { timeout: 15_000 });
  const video = readFileSync(videoPath);
  const sourceIndex = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=time_base:frame=pts,best_effort_timestamp_time', '-of', 'json', videoPath], { encoding: 'utf8', timeout: 15_000 })) as { streams: { time_base: string }[]; frames: { pts: number; best_effort_timestamp_time: string }[] };
  const imagePath = join(directory, 'synthetic-reference.jpg');
  execFileSync('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-ss', '3', '-i', videoPath, '-frames:v', '1', imagePath], { timeout: 15_000 });
  const image = readFileSync(imagePath);
  const images = new Map<string, Buffer>([[uuid(77), image]]);
  const metadata = new Map<string, Artifact>();
  const videos = new Map<string, Buffer>();
  const a = eventFixture(6, 'INCOMPLETE'), b = eventFixture(16, 'UNCERTAIN'), c = eventFixture(26, 'RELEASE_CANDIDATE');
  a.release_us = b.release_us = c.release_us = 3_000_000;
  a.transitions = ['INTERACTION_CANDIDATE', 'RELEASE_CANDIDATE', 'LANDING_CANDIDATE', 'STABILIZED', 'RETRIEVAL_WINDOW', 'CONFIRMATION_CHECK', 'INCOMPLETE'].map((state, index, states) => ({
    id: uuid(100 + index), sequence: index + 1, previous: states[index - 1] ?? 'NO_EVENT', state,
    source_us: [2_000_000, 3_000_000, 3_500_000, 6_500_000, 6_500_000, 36_500_000, 36_500_000][index]!,
    reason: index === 6 ? 'required_media_missing' : 'synthetic_injected_history', evidence: { fixture: true }, provenance: 'observation_fixture', processing_at: now(), created_at: now(),
  }));
  b.transitions[0]!.source_us = 3_500_000; b.transitions[0]!.reason = 'unknown_object_proposal';
  c.phase = 'provisional'; c.transitions = a.transitions.slice(0, 2).map((transition, index) => ({ ...structuredClone(transition), id: uuid(160 + index) })); c.clips = [];
  for (const event of [a, b]) {
    const clip = event.clips[0]!;
    clip.status = 'partial'; clip.requested = [-12_000_000, 48_000_000]; clip.required = [3_000_000, event === a ? 36_500_001 : 3_500_001];
    clip.coverage = { available: [[0, 8_000_000]], missing: [[-12_000_000, 0], [8_000_000, 48_000_000]], required_missing: event === a ? [[8_000_000, 36_500_001]] : [], parts: clip.media, reason: 'media_missing_or_corrupt' };
    videos.set(clip.media[0]!, video);
    metadata.set(clip.media[0]!, { ...structuredClone(artifact), id: clip.media[0]!, byte_size: video.byteLength, sha256: createHash('sha256').update(video).digest('hex'), metadata: { epoch: uuid(4), source_span_us: [0, 8_000_000], index: { start_us: 0 }, fixture: true, redacted: false } });
  }
  // Two genuinely separate MP4 files across a declared contextual gap. The
  // related-media order is intentionally reversed; ordered coverage is authority.
  const bParts = [{ id: uuid(18), start: 0, end: 6 }, { id: uuid(88), start: 7, end: 8 }];
  for (const part of bParts) {
    const output = join(directory, `${part.id}.mp4`);
    execFileSync('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-ss', String(part.start), '-i', videoPath, '-t', String(part.end - part.start), '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', output], { timeout: 15_000 });
    const bytes = readFileSync(output); videos.set(part.id, bytes);
    metadata.set(part.id, { ...structuredClone(artifact), id: part.id, byte_size: bytes.byteLength, sha256: createHash('sha256').update(bytes).digest('hex'), metadata: { epoch: uuid(4), source_span_us: [part.start * 1_000_000, part.end * 1_000_000], index: { start_us: 0 }, fixture: true, redacted: false } });
  }
  b.clips[0]!.media = [uuid(88), uuid(18)];
  b.clips[0]!.coverage = { available: [[0, 6_000_000], [7_000_000, 8_000_000]], missing: [[-12_000_000, 0], [6_000_000, 7_000_000], [8_000_000, 48_000_000]], required_missing: [], parts: [uuid(18), uuid(88)], reason: 'media_missing_or_corrupt' };
  const syntheticSession = structuredClone(session);
  syntheticSession.health.preview = { artifact: uuid(77), source_us: 3_000_000, epoch: uuid(4), source_age_seconds: 42, stale: true, source_observed_at: now(), age_basis: 'sealed_recording_host_mtime_not_camera_utc' };
  syntheticSession.health.captured_through = { epoch: uuid(4), source_us: 8_000_000 };
  const state: MockState = { cameras: [{ ...camera, name: 'UI HTTP MOCK / synthetic source' }], sessions: [syntheticSession], runs: [structuredClone(run)], events: [a, b, c], configurations: [structuredClone(configuration)], calls: [], unhandled: [], loseCameraAcknowledgement: false, failReviewOnce: false, loseReviewAcknowledgement: false, unavailableMedia: false, failGeometryOnce: false, loseGeometryAcknowledgement: false, loseReplayAcknowledgement: false, reviewResponseWait: null };
  let counter = 200;
  const nextId = () => uuid(counter++);
  const jobs = new Map<string, { id: string; status: string; media: string; source_us: number; polls: number }>();
  const reply = (route: Route, data: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ data, warnings: ['FRONTEND HTTP MOCK / NO DATABASE', 'UNVALIDATED', 'UNREDACTED', 'FIXTURES ARE NOT MODEL EVIDENCE'], production_activation: 'disabled' }) });

  await page.route('**/ui-assets/', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, headers: { ...response.headers(), 'Content-Security-Policy': shellCsp } });
  });
  await page.route('**/media/**', async route => {
    const id = new URL(route.request().url()).pathname.split('/').at(-1)!;
    if (state.unavailableMedia) return route.fulfill({ status: 410, body: 'Synthetic test media unavailable' });
    const jpeg = images.get(id);
    if (jpeg) return route.fulfill({ status: 200, contentType: 'image/jpeg', body: jpeg });
    const video = videos.get(id);
    if (video) {
      // Match the real media endpoint's byte-range contract, rather than making
      // a native seek test depend on a non-seekable 200-only HTTP double.
      const range = route.request().headers()['range'];
      if (range) {
        const parsed = /^bytes=(\d*)-(\d*)$/.exec(range);
        const start = parsed?.[1] ? Number(parsed[1]) : Math.max(0, video.byteLength - Number(parsed?.[2]));
        const end = parsed?.[1] && parsed[2] ? Math.min(video.byteLength - 1, Number(parsed[2])) : video.byteLength - 1;
        if (!parsed || !Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start > end || start >= video.byteLength) return route.fulfill({ status: 416, headers: { 'Content-Range': `bytes */${video.byteLength}` }, body: '' });
        return route.fulfill({ status: 206, contentType: 'video/mp4', headers: { 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${start}-${end}/${video.byteLength}` }, body: video.subarray(start, end + 1) });
      }
      return route.fulfill({ status: 200, contentType: 'video/mp4', headers: { 'Accept-Ranges': 'bytes' }, body: video });
    }
    state.unhandled.push(`media:${id}`);
    return route.fulfill({ status: 404, body: 'No test media for this ID' });
  });
  await page.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    const method = request.method();
    const body = method === 'POST' ? request.postDataJSON() as Record<string, unknown> : {};
    state.calls.push({ method, path, body });
    if (method === 'POST' && request.headers()['x-csrftoken'] !== health.csrf_token) return reply(route, { error: 'csrf_rejected' }, 403);
    if (path === '/api/health') return reply(route, { ...health, sources: state.cameras.length });
    if (path === '/api/cameras' && method === 'GET') return reply(route, state.cameras);
    if (path === '/api/cameras' && method === 'POST') {
      if (state.cameras.length >= 2) return reply(route, { error: 'invalid_request', reasons: ['At most two source identities'] }, 400);
      const value: Camera = { id: nextId(), name: string(body.name), kind: body.kind as Camera['kind'], secret_ref: string(body.secret_ref), permission_ref: string(body.permission_ref), data_provenance: string(body.data_provenance), active_revision: null, desired_recording: false };
      state.cameras.push(value);
      if (state.loseCameraAcknowledgement) { state.loseCameraAcknowledgement = false; return route.abort('connectionreset'); }
      return reply(route, value, 201);
    }
    if (path === '/api/sessions') return reply(route, state.sessions);
    if (path === '/api/runs') return reply(route, state.runs);
    if (path === '/api/events') return reply(route, state.events.filter(event => (!url.searchParams.get('camera') || state.sessions.find(session => session.id === state.runs.find(run => run.id === event.run)?.session_id)?.camera === url.searchParams.get('camera')) && (!url.searchParams.get('outcome') || event.machine_outcome === url.searchParams.get('outcome')) && (!url.searchParams.get('phase') || event.phase === url.searchParams.get('phase')) && (!url.searchParams.get('reason') || event.transitions.some(transition => transition.reason === url.searchParams.get('reason')))));
    const eventRoute = /^\/api\/events\/([^/]+)(?:\/(reviews|clips))?$/.exec(path);
    if (eventRoute) {
      const event = state.events.find(event => event.id === eventRoute[1]);
      if (!event) return reply(route, { error: 'not_found' }, 404);
      if (!eventRoute[2] && method === 'GET') return reply(route, event);
      if (eventRoute[2] === 'reviews' && method === 'POST') {
        if (state.failReviewOnce) { state.failReviewOnce = false; return reply(route, { error: 'invalid_request', reasons: ['Injected definite validation failure'] }, 400); }
        event.reviews.push({ id: nextId(), state: body.state as ReviewState, reason: string(body.reason), notes: string(body.notes), reviewer_label: string(body.reviewer_label), supersedes_id: string(body.supersedes) || null, created_at: now() });
        if (state.loseReviewAcknowledgement) { state.loseReviewAcknowledgement = false; return route.abort('connectionreset'); }
        if (state.reviewResponseWait) await state.reviewResponseWait;
        return reply(route, event, 201);
      }
      if (eventRoute[2] === 'clips' && method === 'POST') {
        const value = structuredClone(event.clips[0]!); value.id = nextId(); value.revision = event.clips.length + 1;
        value.required = [Number(body.required_start_us), Number(body.required_end_us)]; event.clips.push(value); return reply(route, value, 202);
      }
    }
    const cameraRoute = /^\/api\/cameras\/([^/]+)(?:\/(recording|configurations))?$/.exec(path);
    if (cameraRoute) {
      const value = state.cameras.find(camera => camera.id === cameraRoute[1]);
      if (!value) return reply(route, { error: 'not_found' }, 404);
      if (cameraRoute[2] === 'configurations' && method === 'GET') return reply(route, state.configurations);
      if (cameraRoute[2] === 'configurations' && method === 'POST') {
        if (state.failGeometryOnce) { state.failGeometryOnce = false; return reply(route, { error: 'invalid_request', reasons: ['Injected server overlap rejection'] }, 400); }
        const revision: Configuration = { ...structuredClone(configuration), id: nextId(), sequence: Math.max(...state.configurations.map(value => value.sequence)) + 1, geometry: body.geometry as Geometry, settings: body.settings as Record<string, unknown>, activated_at: now() };
        state.configurations.push(revision); value.active_revision = revision.id;
        if (state.loseGeometryAcknowledgement) { state.loseGeometryAcknowledgement = false; return route.abort('connectionreset'); }
        return reply(route, revision, 201);
      }
      if (cameraRoute[2] === 'recording' && method === 'POST') {
        value.desired_recording = body.enabled === true;
        if (value.desired_recording && !state.sessions.some(session => session.camera === value.id && !session.stopped_at)) {
          const epoch = nextId(), previewId = nextId(); images.set(previewId, image);
          const captured: Session = { ...structuredClone(syntheticSession), id: nextId(), camera: value.id, configuration: value.active_revision!, started_at: now(), stopped_at: null, status: 'recording', epochs: [{ ...syntheticSession.epochs[0]!, id: epoch }], health: { transport: 'connected', recording: 'sealed', processing: 'not_implemented', captured_through: { epoch, source_us: 8_000_000 }, preview: { artifact: previewId, epoch, source_us: 3_000_000, source_age_seconds: .5, stale: false, source_observed_at: now(), age_basis: 'sealed_recording_host_mtime_not_camera_utc' } } };
          state.sessions.unshift(captured);
        } else if (!value.desired_recording) {
          for (const session of state.sessions.filter(session => session.camera === value.id && !session.stopped_at)) { session.stopped_at = now(); session.status = 'stopped'; session.health.transport = 'stopped'; session.health.recording = 'stopped'; }
        }
        return reply(route, value, 202);
      }
      if (!cameraRoute[2] && method === 'POST') { value.name = string(body.name); value.secret_ref = string(body.secret_ref); value.permission_ref = string(body.permission_ref); return reply(route, value); }
    }
    const replayRoute = /^\/api\/sessions\/([^/]+)\/replays$/.exec(path);
    if (replayRoute && method === 'POST') {
      const summary: RunSummary = { ...run, id: nextId(), session_id: replayRoute[1]!, mode: body.mode as RunSummary['mode'], created_at: now() };
      state.runs.unshift(summary);
      if (state.loseReplayAcknowledgement) { state.loseReplayAcknowledgement = false; return route.abort('connectionreset'); }
      return reply(route, { id: summary.id, mode: summary.mode, configuration: summary.configuration_id, input_manifest: { session: summary.session_id, segments: [{ id: uuid(9), epoch: uuid(4), start_us: 0, end_us: 8_000_000, sha256: createHash('sha256').update(video).digest('hex') }], gaps: [], clock: 'epoch_source_microseconds_not_wall_time' }, versions: summary.versions }, 201);
    }
    if (/^\/api\/runs\/[^/]+\/timeline$/.test(path)) return reply(route, { run: path.split('/')[3], mode: state.runs.find(run => run.id === path.split('/')[3])!.mode, frames: sourceIndex.frames.map((frame, index) => ({ epoch: uuid(4), segment: uuid(9), frame: index, source_us: Math.round(Number(frame.best_effort_timestamp_time) * 1_000_000), raw_pts: frame.pts, time_base: sourceIndex.streams[0]!.time_base })), next: null, clock: 'epoch_source_microseconds_not_wall_time', gaps: [] });
    const frameRequest = /^\/api\/segments\/[^/]+\/frames$/.test(path);
    if (frameRequest && method === 'POST') {
      const id = nextId(), media = nextId(), sourceUs = Number(body.source_us), output = join(directory, `${id}.jpg`);
      execFileSync('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-ss', String(sourceUs / 1_000_000), '-i', videoPath, '-frames:v', '1', output], { timeout: 15_000 });
      const bytes = readFileSync(output); images.set(media, bytes);
      metadata.set(media, { ...structuredClone(artifact), id: media, mime: 'image/jpeg', classification: 'frame_unredacted', byte_size: bytes.byteLength, sha256: createHash('sha256').update(bytes).digest('hex'), metadata: { epoch: uuid(4), source_us: sourceUs, fixture: true, redacted: false } });
      jobs.set(id, { id, status: 'available', media, source_us: sourceUs, polls: 0 });
      return reply(route, { id, status: 'queued' }, 202);
    }
    const jobId = /^\/api\/frames\/([^/]+)$/.exec(path)?.[1];
    if (jobId && jobs.has(jobId)) {
      const job = jobs.get(jobId)!; job.polls++;
      return reply(route, job.polls === 1 ? { id: job.id, status: 'running' } : job);
    }
    const artifactRoute = /^\/api\/artifacts\/([^/]+)(?:\/(pins))?$/.exec(path);
    if (artifactRoute && metadata.has(artifactRoute[1]!)) {
      const value = metadata.get(artifactRoute[1]!)!;
      if (artifactRoute[2] === 'pins' && method === 'POST') {
        const pin = { id: nextId(), purpose: string(body.purpose), expires_at: new Date(Date.now() + Number(body.seconds) * 1000).toISOString(), released_at: null };
        value.pins.push(pin); return reply(route, pin, 201);
      }
      return reply(route, value);
    }
    state.unhandled.push(`${method} ${path}`);
    return reply(route, { error: 'not_found' }, 404);
  });
  return state;
}
