import { describe, expect, it, vi } from 'vitest';
import { ApiError, DjangoApi, errorMessage, mediaUrl } from '../src/api/client';
import { camera, health, run, uuid } from './fixtures';

const wire = (data: unknown, status = 200) => new Response(JSON.stringify({ data, warnings: ['EXPLICIT MOCK HTTP TEST'], production_activation: 'disabled' }), { status, headers: { 'Content-Type': 'application/json' } });

describe('typed same-origin Django boundary (mock HTTP, not Django E2E)', () => {
  it('initializes CSRF and sends cookies/token only on same-origin JSON writes', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(wire(health)).mockResolvedValueOnce(wire(camera, 201));
    const api = new DjangoApi(fetcher);
    await expect(api.createCamera({ name: camera.name, kind: camera.kind, secret_ref: camera.secret_ref, permission_ref: camera.permission_ref, data_provenance: camera.data_provenance })).resolves.toEqual(camera);
    expect(fetcher.mock.calls[0]?.[0]).toBe('/api/health');
    const [path, request] = fetcher.mock.calls[1]!;
    expect(path).toBe('/api/cameras');
    expect(request).toMatchObject({ method: 'POST', credentials: 'same-origin', redirect: 'error', headers: { 'X-CSRFToken': health.csrf_token, 'Content-Type': 'application/json' } });
    expect(String(request?.body)).not.toContain('rtsp://');
  });

  it('retains the global native-fetch receiver instead of a class-instance receiver', async () => {
    const fetcher = vi.fn(function (this: unknown) { expect(this).toBe(globalThis); return Promise.resolve(wire([camera])); });
    await expect(new DjangoApi(fetcher).cameras()).resolves.toEqual([camera]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('uses the real persisted run-summary shape rather than assuming replay manifests', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(wire([run]));
    await expect(new DjangoApi(fetcher).runs()).resolves.toEqual([run]);
    expect(fetcher.mock.calls[0]?.[0]).toBe('/api/runs');
  });

  it('encodes exact filters without query injection', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(wire([]));
    await new DjangoApi(fetcher).queue({ camera: camera.id, outcome: 'INCOMPLETE', reason: 'gap&phase=provisional', phase: 'final' });
    const url = new URL(String(fetcher.mock.calls[0]?.[0]), 'http://localhost');
    expect(url.searchParams.get('reason')).toBe('gap&phase=provisional');
    expect(url.searchParams.get('phase')).toBe('final');
  });

  it('does not print HTML error pages or raw network secrets', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response('<html>rtsp://password@private.invalid</html>', { status: 404, headers: { 'Content-Type': 'text/html' } }));
    const issue = await new DjangoApi(fetcher).cameras().catch(error => error);
    expect(issue).toBeInstanceOf(ApiError);
    expect(errorMessage(issue)).toContain('HTTP 404');
    expect(errorMessage(issue)).not.toContain('private.invalid');
    expect(errorMessage(new Error('private raw exception'))).not.toContain('private raw exception');
  });

  it('marks an interrupted POST as unconfirmed and never automatically retries it', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(wire(health)).mockRejectedValueOnce(new TypeError('rtsp://user:secret@hidden.invalid'));
    const api = new DjangoApi(fetcher);
    const issue = await api.recording(camera.id, true).catch(error => error);
    expect(issue).toMatchObject({ uncertainWrite: true, code: 'connection_unavailable' });
    expect(errorMessage(issue)).not.toContain('secret@');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('keeps failed 5xx writes unconfirmed, including ambiguous database commit failures', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(wire(health)).mockResolvedValueOnce(wire({ error: 'database_unavailable' }, 503));
    await expect(new DjangoApi(fetcher).recording(camera.id, false)).rejects.toMatchObject({ code: 'database_unavailable', uncertainWrite: true });
  });

  it('reports bounded application-owned validation reasons without assuming save success', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(wire(health)).mockResolvedValueOnce(wire({ error: 'invalid_request', reasons: ['Polygon edges intersect'] }, 400));
    const issue = await new DjangoApi(fetcher).recording(camera.id, true).catch(error => error);
    expect(issue).toMatchObject({ code: 'invalid_request', uncertainWrite: false });
    expect(errorMessage(issue)).toContain('Polygon edges intersect');
  });

  it('refreshes a rejected CSRF token only for a subsequent explicit write', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(wire(health)).mockResolvedValueOnce(wire({ error: 'csrf_rejected' }, 403)).mockResolvedValueOnce(wire({ ...health, csrf_token: 'second-test-token' })).mockResolvedValueOnce(wire(camera));
    const api = new DjangoApi(fetcher);
    await expect(api.recording(camera.id, true)).rejects.toMatchObject({ code: 'csrf_rejected', uncertainWrite: false });
    expect(fetcher).toHaveBeenCalledTimes(2);
    await api.recording(camera.id, true);
    expect(fetcher.mock.calls[3]?.[1]?.headers).toMatchObject({ 'X-CSRFToken': 'second-test-token' });
  });

  it('rejects missing required fields and any attempt to claim production activation', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(wire([{ id: uuid(1) }])).mockResolvedValueOnce(new Response(JSON.stringify({ data: [], warnings: [], production_activation: 'enabled' }), { headers: { 'Content-Type': 'application/json' } }));
    const api = new DjangoApi(fetcher);
    await expect(api.cameras()).rejects.toMatchObject({ code: 'invalid_response' });
    await expect(api.cameras()).rejects.toMatchObject({ code: 'invalid_response' });
  });

  it('accepts controlled media UUIDs only', () => {
    expect(mediaUrl(uuid(1))).toBe(`/media/${uuid(1)}`);
    expect(() => mediaUrl('../../runtime/secrets')).toThrow();
    expect(() => mediaUrl('https://remote.invalid/video')).toThrow();
  });
});
