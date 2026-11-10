import { useCallback, useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { ApiError, errorMessage, mediaUrl } from '../api/client';
import type { WorkbenchApi } from '../api/client';
import { identity, sourceTime } from '../api/types';
import type { Artifact } from '../api/types';
import { bytes, shortId, sourceSeconds, timestamp } from '../format';
import { useResource } from '../hooks';
import type { Resource } from '../hooks';
import { Button, Empty, Facts, JsonFacts, Notice, Status, TextInput } from './ui';

const videoMapping = z.object({
  epoch: identity,
  source_span_us: z.tuple([sourceTime, sourceTime]),
  index: z.object({ start_us: z.number().int() }),
});

export function ArtifactFacts({ api, id, provided }:
  { api: WorkbenchApi; id: string; provided?: Resource<Artifact> }) {
  const load = useCallback((signal: AbortSignal) => api.artifact(id, signal), [api, id]);
  const query = useResource(`artifact:${id}`, load, { enabled: !provided, interval: 10_000 });
  const resource = provided ?? query;
  const [seconds, setSeconds] = useState('3600');
  const [pending, setPending] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const lock = useRef(false);
  async function reserve() {
    const duration = Number(seconds);
    if (lock.current || uncertain || !Number.isInteger(duration) || duration < 1 || duration > 604800) return;
    lock.current = true; setPending(true); setError(''); setMessage('');
    try {
      const pin = await api.pin(id, 'local-evidence-inspection', duration);
      setMessage(`Reservation ${shortId(pin.id)} was stored until ${timestamp(pin.expires_at)}.`);
      resource.refresh();
    } catch (failure) {
      setError(errorMessage(failure));
      if (failure instanceof ApiError && failure.uncertainWrite) setUncertain(true);
    } finally { lock.current = false; setPending(false); }
  }
  const artifact = resource.data;
  return <details className="panel" aria-label="Media provenance and bounded reservations"><summary>Media provenance, storage & reservations</summary>
    <div className="stack">
      {resource.loading && <Notice>Loading controlled media metadata…</Notice>}
      {resource.error && <Notice tone="error">Metadata refresh failed; retained facts may be stale. {resource.error} <Button onClick={resource.refresh}>Recheck metadata</Button></Notice>}
      {artifact && <><div className="cluster"><Status tone={artifact.status === 'available' ? 'neutral' : 'error'}>{artifact.status}</Status><Status>{artifact.classification.replaceAll('_', ' ')}</Status></div>
        <Facts items={[
          ['Controlled media ID', <code>{artifact.id}</code>], ['MIME / size', `${artifact.mime} / ${bytes(artifact.byte_size)}`],
          ['SHA-256', <code>{artifact.sha256}</code>], ['Expires', timestamp(artifact.expires_at)],
          ['Active reservations', artifact.pins.filter(pin => !pin.released_at && new Date(pin.expires_at).valueOf() > Date.now()).length],
        ]} />
        <JsonFacts value={{ lineage: artifact.lineage, metadata: artifact.metadata, reservations: artifact.pins }} title="Stored lineage, source mapping and reservations" />
        <Notice tone="warning">Unredacted local media. A bounded reservation prevents ordinary expiry while active; it is not a legal hold, redaction, authorization or retention-governance control.</Notice>
        <div className="reservation-controls"><TextInput label="Reservation duration (seconds)" type="number" min="1" max="604800" step="1" value={seconds} onChange={event => setSeconds(event.target.value)} disabled={pending || uncertain} />
          <Button disabled={pending || uncertain || artifact.status !== 'available' || !Number.isInteger(Number(seconds)) || Number(seconds) < 1 || Number(seconds) > 604800} onClick={() => { void reserve(); }}>{pending ? 'Reserving…' : 'Reserve current media'}</Button></div>
        {message && <Notice tone="info" live>{message}</Notice>}
        {error && <Notice tone="error" title={uncertain ? 'Reservation acknowledgement unknown' : 'Reservation not saved'} live>{error}{uncertain && ' Check stored reservations; no automatic or blind retry is offered.'}</Notice>}
      </>}
    </div>
  </details>;
}

/** Its key is the immutable artifact ID, never polling/health data. Position is
 * retained outside the element so explicit event/part navigation can resume it.
 */
export function EvidenceVideo({ api, id, active, positions }:
  { api: WorkbenchApi; id: string; active: boolean; positions: Map<string, number> }) {
  const load = useCallback((signal: AbortSignal) => api.artifact(id, signal), [api, id]);
  const artifact = useResource(`video-artifact:${id}`, load, { interval: 10_000 });
  const ref = useRef<HTMLVideoElement>(null);
  const [playhead, setPlayhead] = useState(positions.get(id) ?? 0);
  const [mediaError, setMediaError] = useState('');
  const mapping = videoMapping.safeParse(artifact.data?.metadata);
  const approximateSource = mapping.success ? Math.min(mapping.data.source_span_us[1], mapping.data.source_span_us[0] + Math.max(0, Math.round(playhead * 1_000_000) - mapping.data.index.start_us)) : null;
  useEffect(() => {
    if (!active) ref.current?.pause();
  }, [active]);
  useEffect(() => {
    const video = ref.current;
    return () => {
      if (!video) return;
      if (video.readyState > 0 || video.currentTime > 0) positions.set(id, video.currentTime);
      video.pause();
    };
  }, [id, positions, artifact.data?.mime, artifact.data?.status]);
  const playable = artifact.data?.mime === 'video/mp4' && artifact.data.status === 'available';
  return <section className="stack" aria-label="Evidence clip playback">
    <div className="panel evidence">
      <div className="evidence-header"><div><strong>Recorded evidence / UNREDACTED</strong><p>Observation-fixture context, not model evidence. Native seeking is approximate.</p></div><span className="mono">Media {shortId(id)}</span></div>
      <div className="evidence-stage">{playable ? <video ref={ref} src={mediaUrl(id)} controls muted playsInline preload="metadata" aria-label="Unredacted recorded evidence clip"
        onLoadedMetadata={event => {
          const video = event.currentTarget;
          const saved = positions.get(id);
          if (saved !== undefined && Number.isFinite(video.duration)) video.currentTime = Math.min(saved, Math.max(0, video.duration - .001));
          setMediaError('');
        }} onTimeUpdate={event => {
          const value = event.currentTarget.currentTime;
          positions.set(id, value); setPlayhead(value);
        }} onError={() => setMediaError('The media is missing, expired, unreadable or unsupported by this browser. No substitute video is shown.')}>This browser cannot play the controlled MP4. Use source-indexed frame inspection.</video>
        : <Empty title={artifact.loading ? 'Loading clip metadata' : 'Playable clip unavailable'}>{artifact.data ? `Catalog status: ${artifact.data.status}; MIME: ${artifact.data.mime}. Raw source TS is not a promised browser format.` : 'A catalogued, available MP4 is required. Use the explicit coverage and source-indexed frame controls.'}</Empty>}</div>
      {mediaError && <div className="media-error" role="status">{mediaError}</div>}
      <div className="evidence-footer"><Facts items={[
        ['Approximate source context', approximateSource === null ? null : sourceSeconds(approximateSource)],
        ['Media playback time', `${playhead.toFixed(3)}s / not guaranteed frame-accurate`],
        ['Epoch', mapping.success ? <code>{shortId(mapping.data.epoch)}</code> : null],
      ]} /></div>
      {playable && <div className="evidence-actions"><Button onClick={() => { ref.current?.pause(); ref.current?.load(); }}>Reload video / retain position</Button><span className="small muted">Use the source index below to verify an exact frame.</span></div>}
    </div>
    {artifact.error && <Notice tone="error">Catalog refresh failed. Last received metadata or buffered video does not establish current coverage. {artifact.error} <Button onClick={artifact.refresh}>Recheck catalog</Button></Notice>}
    <ArtifactFacts api={api} id={id} provided={artifact} />
  </section>;
}
