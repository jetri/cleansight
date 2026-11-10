import { z } from 'zod';
import {
  artifactSchema, backendHealthSchema, cameraSchema, clipSchema, configurationSchema,
  eventSchema, frameJobSchema, identity, runSchema, runSummarySchema, sessionSchema, timelineSchema,
} from './types';
import type {
  Artifact, BackendHealth, Camera, CameraEdit, CameraInput, Clip, Configuration,
  Cursor, EventFilters, FrameJob, Geometry, ReviewInput, Run, RunSummary, Session, StoredEvent, Timeline,
} from './types';

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly uncertainWrite = false,
    public readonly reasons: readonly string[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function errorMessage(error: unknown): string {
  // Never print request bodies, arbitrary URLs, tracebacks or raw fetch errors.
  return error instanceof ApiError ? [error.message, ...error.reasons].join(' ') : 'The operation could not be completed. Try again.';
}

export interface WorkbenchApi {
  health(signal?: AbortSignal): Promise<BackendHealth>;
  cameras(signal?: AbortSignal): Promise<Camera[]>;
  createCamera(input: CameraInput): Promise<Camera>;
  editCamera(id: string, input: CameraEdit): Promise<Camera>;
  configurations(camera: string, signal?: AbortSignal): Promise<Configuration[]>;
  configure(camera: string, geometry: Geometry, settings: Record<string, unknown>): Promise<Configuration>;
  recording(camera: string, enabled: boolean): Promise<Camera>;
  sessions(signal?: AbortSignal): Promise<Session[]>;
  runs(signal?: AbortSignal): Promise<RunSummary[]>;
  queue(filters: EventFilters, signal?: AbortSignal): Promise<StoredEvent[]>;
  replay(session: string, mode: Run['mode']): Promise<Run>;
  events(run: string, signal?: AbortSignal): Promise<StoredEvent[]>;
  event(id: string, signal?: AbortSignal): Promise<StoredEvent>;
  review(event: string, input: ReviewInput): Promise<StoredEvent>;
  requestClip(event: string, start: number, end: number): Promise<Clip>;
  clip(id: string, signal?: AbortSignal): Promise<Clip>;
  artifact(id: string, signal?: AbortSignal): Promise<Artifact>;
  pin(id: string, purpose: string, seconds: number): Promise<{ id: string; expires_at: string }>;
  timeline(run: string, cursor: Cursor, signal?: AbortSignal): Promise<Timeline>;
  requestFrame(segment: string, sourceUs: number): Promise<FrameJob>;
  frame(id: string, signal?: AbortSignal): Promise<FrameJob>;
}

const envelope = z.object({
  data: z.unknown(),
  warnings: z.array(z.string()),
  production_activation: z.literal('disabled'),
});
const errorData = z.object({ error: z.string(), reasons: z.array(z.string().max(500)).max(32).optional() });
const safeMessages: Record<string, string> = {
  invalid_request: 'The server rejected these values. Check the fields and geometry; the draft is retained.',
  not_found: 'This record is no longer available. Refresh the list.',
  conflict: 'This change conflicts with a stored record. Refresh before retrying; the draft is retained.',
  csrf_rejected: 'The security token was rejected. Refresh the connection before submitting again.',
  database_unavailable: 'The local database is unavailable. Nothing is confirmed saved.',
  media_or_storage_unavailable: 'The local media or storage service is unavailable. Check source coverage.',
  media_unavailable: 'This media is unavailable. Inspect the recorded missing spans and retention state.',
  media_missing: 'The media file is missing. A surviving frame cannot restore lost coverage.',
  media_changed: 'Media integrity changed. It cannot be treated as complete evidence.',
};
const idPath = (id: string) => encodeURIComponent(identity.parse(id));

export class DjangoApi implements WorkbenchApi {
  private csrf = '';
  private csrfRequest: Promise<BackendHealth> | null = null;

  constructor(private readonly fetcher: typeof fetch = fetch) {
    // Native Window.fetch rejects a class instance as its receiver. Test doubles
    // often accept it, so retain the real global receiver explicitly.
    this.fetcher = fetcher.bind(globalThis);
  }

  private async request<T>(
    path: string,
    schema: z.ZodType<T>,
    input?: unknown,
    signal?: AbortSignal,
  ): Promise<T> {
    const unsafe = input !== undefined;
    if (unsafe && !this.csrf) {
      this.csrfRequest ??= this.health().finally(() => { this.csrfRequest = null; });
      await this.csrfRequest;
    }
    const timeout = AbortSignal.timeout(20_000);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    let response: Response;
    try {
      response = await this.fetcher(path, {
        method: unsafe ? 'POST' : 'GET',
        credentials: 'same-origin',
        redirect: 'error',
        signal: combined,
        headers: {
          Accept: 'application/json',
          ...(unsafe ? { 'Content-Type': 'application/json', 'X-CSRFToken': this.csrf } : {}),
        },
        ...(unsafe ? { body: JSON.stringify(input) } : {}),
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new ApiError(
        'connection_unavailable',
        unsafe
          ? 'The server acknowledgement was not received. The draft is retained; check stored history before retrying.'
          : 'Cannot reach the local backend. Check the application and database; existing evidence is not refreshed.',
        unsafe,
      );
    }
    const contentType = response.headers.get('Content-Type')?.split(';')[0]?.trim().toLowerCase();
    if (contentType !== 'application/json') {
      throw new ApiError('invalid_response', `The local service returned an incompatible response (HTTP ${response.status}). No success is assumed.`, unsafe);
    }
    let raw: unknown;
    try { raw = await response.json(); } catch {
      throw new ApiError('invalid_response', 'The backend returned an unreadable response. Check the local service.', unsafe);
    }
    const parsed = envelope.safeParse(raw);
    if (!parsed.success) {
      throw new ApiError('invalid_response', 'The backend response is incompatible with this workspace.', unsafe);
    }
    if (!response.ok) {
      const issue = errorData.safeParse(parsed.data.data);
      const code = issue.success ? issue.data.error : 'request_failed';
      if (code === 'csrf_rejected') this.csrf = '';
      throw new ApiError(code, safeMessages[code] ?? `The request failed (HTTP ${response.status}). The draft is retained.`, unsafe && response.status >= 500, issue.success ? issue.data.reasons : []);
    }
    const result = schema.safeParse(parsed.data.data);
    if (!result.success) {
      throw new ApiError('invalid_response', 'Required backend fields are missing or invalid. No success is assumed.', unsafe);
    }
    return result.data;
  }

  async health(signal?: AbortSignal) {
    const value = await this.request('/api/health', backendHealthSchema, undefined, signal);
    this.csrf = value.csrf_token;
    return value;
  }
  cameras(signal?: AbortSignal) { return this.request('/api/cameras', z.array(cameraSchema), undefined, signal); }
  createCamera(input: CameraInput) { return this.request('/api/cameras', cameraSchema, input); }
  editCamera(id: string, input: CameraEdit) { return this.request(`/api/cameras/${idPath(id)}`, cameraSchema, input); }
  configurations(id: string, signal?: AbortSignal) {
    return this.request(`/api/cameras/${idPath(id)}/configurations`, z.array(configurationSchema), undefined, signal);
  }
  configure(id: string, geometry: Geometry, settings: Record<string, unknown>) {
    return this.request(`/api/cameras/${idPath(id)}/configurations`, configurationSchema, { geometry, settings });
  }
  recording(id: string, enabled: boolean) {
    return this.request(`/api/cameras/${idPath(id)}/recording`, cameraSchema, { enabled });
  }
  sessions(signal?: AbortSignal) { return this.request('/api/sessions', z.array(sessionSchema), undefined, signal); }
  runs(signal?: AbortSignal) {
    return this.request('/api/runs', z.array(runSummarySchema), undefined, signal);
  }
  queue(filters: EventFilters, signal?: AbortSignal) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) if (value) query.set(key, value);
    return this.request(`/api/events?${query}`, z.array(eventSchema), undefined, signal);
  }
  replay(id: string, mode: Run['mode']) {
    return this.request(`/api/sessions/${idPath(id)}/replays`, runSchema, { mode });
  }
  events(id: string, signal?: AbortSignal) {
    return this.request(`/api/runs/${idPath(id)}/events`, z.array(eventSchema), undefined, signal);
  }
  event(id: string, signal?: AbortSignal) {
    return this.request(`/api/events/${idPath(id)}`, eventSchema, undefined, signal);
  }
  review(id: string, input: ReviewInput) {
    return this.request(`/api/events/${idPath(id)}/reviews`, eventSchema, input);
  }
  requestClip(id: string, start: number, end: number) {
    return this.request(`/api/events/${idPath(id)}/clips`, clipSchema, { required_start_us: start, required_end_us: end });
  }
  clip(id: string, signal?: AbortSignal) { return this.request(`/api/clips/${idPath(id)}`, clipSchema, undefined, signal); }
  artifact(id: string, signal?: AbortSignal) {
    return this.request(`/api/artifacts/${idPath(id)}`, artifactSchema, undefined, signal);
  }
  pin(id: string, purpose: string, seconds: number) {
    return this.request(`/api/artifacts/${idPath(id)}/pins`, z.object({ id: identity, expires_at: z.string() }), { purpose, seconds });
  }
  timeline(id: string, cursor: Cursor, signal?: AbortSignal) {
    const query = new URLSearchParams({ segment: String(cursor.segment), frame: String(cursor.frame) });
    return this.request(`/api/runs/${idPath(id)}/timeline?${query}`, timelineSchema, undefined, signal);
  }
  requestFrame(id: string, sourceUs: number) {
    return this.request(`/api/segments/${idPath(id)}/frames`, frameJobSchema, { source_us: sourceUs });
  }
  frame(id: string, signal?: AbortSignal) {
    return this.request(`/api/frames/${idPath(id)}`, frameJobSchema, undefined, signal);
  }
}

export function mediaUrl(id: string): string { return `/media/${idPath(id)}`; }
