import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { z } from 'zod';
import { ApiError, errorMessage, mediaUrl } from '../api/client';
import type { WorkbenchApi } from '../api/client';
import { identity, sourceTime } from '../api/types';
import type { Camera, CameraInput, Session } from '../api/types';
import { sourceSeconds, shortId, timestamp } from '../format';
import { useNow, useResource } from '../hooks';
import type { Resource } from '../hooks';
import { Button, Empty, Facts, JsonFacts, Modal, Notice, Select, Status, TextInput } from './ui';
import { ZoneEditor } from './ZoneEditor';

const previewSchema = z.object({
  artifact: identity, epoch: identity, source_us: sourceTime,
  source_age_seconds: z.number().nonnegative(), stale: z.boolean(),
  source_observed_at: z.string(), age_basis: z.string(),
});
export function previewOf(session: Session | null) {
  const value = previewSchema.safeParse(session?.health.preview);
  return value.success ? value.data : null;
}
function usePreviewFreshness(session: Session | null, updatedAt: number | null, disconnected: boolean) {
  const preview = previewOf(session);
  const now = useNow();
  const age = preview ? preview.source_age_seconds + Math.max(0, now - (updatedAt ?? now)) / 1000 : null;
  const stale = !!preview && (preview.stale || (age ?? 0) > 8 || updatedAt === null || disconnected || session?.stopped_at !== null || session?.health.transport !== 'connected');
  return { preview, age, stale };
}
const healthText = (value: unknown) => typeof value === 'string' ? value.replaceAll('_', ' ') : 'Unavailable';

export function SourcePreview({ session, updatedAt, disconnected = false }:
  { session: Session | null; updatedAt: number | null; disconnected?: boolean }) {
  const { preview, age, stale } = usePreviewFreshness(session, updatedAt, disconnected);
  const [failedId, setFailedId] = useState('');
  const failed = !!preview && failedId === preview.artifact;
  return <div className="source-preview" aria-label="Latest sealed-source preview">
    {preview && !failed ? <>
      <img src={mediaUrl(preview.artifact)} alt="Unredacted latest sealed-source still, not a live video feed"
        onError={() => setFailedId(preview.artifact)} />
      {stale && <div className="stale-scrim"><strong>STALE STILL / NOT LIVE</strong><span>Last source {sourceSeconds(preview.source_us)} · epoch {shortId(preview.epoch)}</span></div>}
      <div className="preview-caption"><strong>{stale ? 'Stale preview' : 'Near-live sealed-source still'}</strong> · source {sourceSeconds(preview.source_us)} · age {age?.toFixed(1)}s<br />
        Host recording mtime basis, not camera UTC. Network clock uncertainty remains.</div>
    </> : <Empty title={failed ? 'Preview media unavailable' : 'No preview frame'}>
      {failed ? 'The catalogued still may have expired or failed. No substitute image is shown.' : session ? 'Waiting for a usable sealed recording and preview artifact.' : 'Start a configured source to create a capture session.'}
    </Empty>}
  </div>;
}

function initialCameraInput(camera: Camera | null): CameraInput {
  return { name: camera?.name ?? '', kind: camera?.kind ?? 'rtsp', secret_ref: camera?.secret_ref ?? '', permission_ref: camera?.permission_ref ?? '', data_provenance: camera?.data_provenance ?? 'unclassified' };
}

function CameraForm({ api, camera, referencesLocked, open, onOpen, onSaved, onClose }:
  { api: WorkbenchApi; camera: Camera | null; referencesLocked: boolean; open: boolean; onOpen: () => void; onSaved: (value: Camera, reconciled: boolean) => void; onClose: () => void }) {
  const [values, setValues] = useState<CameraInput>(() => initialCameraInput(camera));
  const [permission, setPermission] = useState(!!camera);
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState<'save' | 'check' | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [matches, setMatches] = useState<Camera[]>([]);
  const [readMessage, setReadMessage] = useState('');
  const [error, setError] = useState('');
  const pendingRef = useRef(false), wasOpen = useRef(false);
  const formId = useId();
  useEffect(() => {
    if (open && !wasOpen.current && !dirty && !uncertain) {
      setValues(initialCameraInput(camera)); setPermission(!!camera); setError(''); setReadMessage(''); setMatches([]);
    }
    wasOpen.current = open;
  }, [open, camera, dirty, uncertain]);
  useEffect(() => {
    if (!dirty && !pending && !uncertain) return;
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [dirty, pending, uncertain]);
  const update = (key: keyof CameraInput, value: string) => {
    setValues(previous => ({ ...previous, [key]: value })); setDirty(true); setMatches([]); setReadMessage(''); setError('');
  };
  const input = { ...values, name: values.name.trim(), secret_ref: values.secret_ref.trim(), permission_ref: values.permission_ref.trim() };
  const matching = (items: Camera[]) => items.filter(item => (!camera || item.id === camera.id) && item.name === input.name && item.secret_ref === input.secret_ref && item.permission_ref === input.permission_ref && (camera || (item.kind === input.kind && item.data_provenance === input.data_provenance)));
  const changedLockedReference = !!camera && referencesLocked && (input.secret_ref !== camera.secret_ref || input.permission_ref !== camera.permission_ref);
  const locked = !!pending || uncertain;
  async function recheck() {
    if (pendingRef.current) return;
    pendingRef.current = true; setPending('check'); setError('');
    try {
      const found = matching(await api.cameras()); setMatches(found);
      setReadMessage(found.length ? 'Matching stored source found. Adopt the canonical record without another write; this does not identify which request created it.' : 'No exact matching source was found. The draft and unknown acknowledgement remain retained; no retry was sent.');
    } catch (failure) { setError(errorMessage(failure)); }
    finally { pendingRef.current = false; setPending(null); }
  }
  async function save(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pendingRef.current || !permission || uncertain || changedLockedReference || matches.length || (camera && !dirty)) return;
    pendingRef.current = true; setPending('save'); setError(''); setReadMessage('');
    try {
      if (!camera) {
        const found = matching(await api.cameras());
        if (found.length) { setMatches(found); setReadMessage('An exact matching source already exists. Adopt it instead of creating a duplicate.'); return; }
      }
      const saved = camera ? await api.editCamera(camera.id, { name: input.name, secret_ref: input.secret_ref, permission_ref: input.permission_ref }) : await api.createCamera(input);
      setDirty(false); onSaved(saved, false);
    } catch (failure) {
      setError(errorMessage(failure));
      if (failure instanceof ApiError && failure.uncertainWrite) setUncertain(true);
    } finally { pendingRef.current = false; setPending(null); }
  }
  function reset() {
    setValues(initialCameraInput(camera)); setPermission(!!camera); setDirty(false); setError(''); setReadMessage(''); setMatches([]);
  }
  return <>
    {!open && (dirty || uncertain) && <Notice tone={uncertain ? 'warning' : 'neutral'}>Retained {camera ? `identity draft for ${camera.name}` : 'new-source draft'}{uncertain ? ' / acknowledgement unknown.' : ' / unsaved.'} <Button onClick={onOpen}>Resume retained source draft{camera ? ` / ${camera.name}` : ''}</Button></Notice>}
    <Modal open={open} title={camera ? 'Edit source identity' : 'Register local source'} onRequestClose={() => { if (!pendingRef.current) onClose(); }}
      actions={<><span className="small muted dialog-action-hint">{pending === 'save' ? 'Awaiting server acknowledgement' : pending === 'check' ? 'Reading stored identities' : 'No recording starts from this form.'}</span>
        <Button onClick={reset} disabled={locked || !dirty}>Reset fields / discard draft</Button><Button onClick={onClose} disabled={!!pending}>Close / retain draft</Button>
        <Button type="submit" form={formId} variant="primary" disabled={locked || !permission || changedLockedReference || matches.length > 0 || (!!camera && !dirty)}>{pending === 'save' ? 'Saving…' : camera ? 'Save identity' : 'Register source'}</Button></>}>
      <form id={formId} onSubmit={event => { void save(event); }} className="stack">
        <Notice title="Protected references, not credentials" tone="info">Use existing protected local runtime reference names. Never paste an RTSP URL, camera password or filesystem path into the browser. Recheck geometry after a source-reference or camera-position change.</Notice>
        <TextInput label="Source name" value={values.name} onChange={event => update('name', event.target.value)} required maxLength={120} autoComplete="off" disabled={locked} />
        {!camera && <div className="form-grid"><Select label="Source type" value={values.kind} disabled={locked} onChange={event => {
          const kind = event.target.value as CameraInput['kind'];
          setValues(previous => ({ ...previous, kind, data_provenance: kind === 'file_fixture' ? 'synthetic' : 'unclassified' })); setDirty(true); setMatches([]); setReadMessage('');
        }}><option value="rtsp">RTSP source</option><option value="file_fixture">Synthetic local file fixture</option></Select>
          <Select label="Data provenance" value={values.data_provenance} disabled={locked || values.kind === 'file_fixture'} onChange={event => update('data_provenance', event.target.value)}><option value="unclassified">Unclassified</option><option value="synthetic">Synthetic</option><option value="staged_real">Staged real footage</option><option value="natural">Natural footage</option></Select>
        </div>}
        <TextInput label="Protected source reference" hint="Existing runtime filename reference only. Its secret value is never returned to the browser." value={values.secret_ref} onChange={event => update('secret_ref', event.target.value)} required pattern="[A-Za-z0-9_.-]+" maxLength={100} autoComplete="off" spellCheck={false} disabled={locked || referencesLocked} />
        <TextInput label="Permission evidence reference" value={values.permission_ref} onChange={event => update('permission_ref', event.target.value)} required maxLength={160} autoComplete="off" disabled={locked || referencesLocked} />
        {referencesLocked && <Notice tone="warning">Stop recording and await actual session shutdown before changing protected references. {changedLockedReference ? 'Reference edits are retained but cannot be submitted.' : 'The name can still be edited.'}</Notice>}
        <label className="check"><input type="checkbox" checked={permission} onChange={event => { setPermission(event.target.checked); setDirty(true); }} disabled={locked} required />Permission to use this source is recorded in the referenced local evidence.</label>
        {uncertain && <Notice tone="warning" title="Source acknowledgement unknown / no blind retry">The backend has no source-creation idempotency key. This draft is retained even when closed, and resubmission is disabled. Read the catalog and adopt an exact matching record without another write.</Notice>}
        {(uncertain || matches.length > 0) && <Button onClick={() => { void recheck(); }} disabled={!!pending}>{pending === 'check' ? 'Checking stored sources…' : 'Recheck stored sources'}</Button>}
        {readMessage && <Notice live>{readMessage}</Notice>}
        {matches.map(match => <Button key={match.id} disabled={!!pending} onClick={() => { setUncertain(false); setDirty(false); setMatches([]); onSaved(match, true); }}>Use matching stored source {shortId(match.id)}</Button>)}
        {error && <Notice tone="error" live title="Not confirmed saved">{error}</Notice>}
      </form>
    </Modal>
  </>;
}

function SourceCard({ api, camera, sessions, onEdit, refreshCameras }:
  { api: WorkbenchApi; camera: Camera; sessions: Resource<Session[]>; onEdit: () => void; refreshCameras: () => void }) {
  const load = useCallback((signal: AbortSignal) => api.configurations(camera.id, signal), [api, camera.id]);
  const revisions = useResource(`configurations:${camera.id}`, load, { interval: 10_000 });
  const config = revisions.data?.find(value => value.id === camera.active_revision) ?? null;
  const latest = sessions.data?.find(value => value.camera === camera.id) ?? null;
  const { preview, stale } = usePreviewFreshness(latest, sessions.updatedAt, !!sessions.error);
  const [zoneOpen, setZoneOpen] = useState(false);
  const [pending, setPending] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const pendingRef = useRef(false);
  const captured = z.object({ epoch: identity, source_us: sourceTime }).safeParse(latest?.health.captured_through);
  async function control(action: 'start' | 'stop' | 'reconnect') {
    if (pendingRef.current) return;
    pendingRef.current = true; setPending(action); setError(''); setMessage('');
    try {
      if (action === 'reconnect') {
        const activeIds = sessions.data?.filter(value => value.camera === camera.id && value.stopped_at === null).map(value => value.id) ?? [];
        if (!activeIds.length) throw new ApiError('session_unverified', 'No active session is available to reconnect. Refresh source state, or use Start recording.');
        await api.recording(camera.id, false);
        setMessage('Stop requested. Waiting for actual session shutdown before reconnecting.');
        let stopped = false;
        for (let attempt = 0; attempt < 30; attempt++) {
          const current = await api.sessions();
          if (activeIds.every(id => current.some(value => value.id === id && value.stopped_at !== null))) { stopped = true; break; }
          await new Promise(resolve => setTimeout(resolve, 1_000));
        }
        if (!stopped) throw new ApiError('shutdown_pending', 'Shutdown is not acknowledged yet. Refresh source state; no reconnect start was sent.');
      }
      await api.recording(camera.id, action !== 'stop');
      setMessage(action === 'stop' ? 'Stop requested and stored. Actual shutdown is shown by session health, not this acknowledgement.' : 'Start requested and stored. Connection, recording and preview are confirmed separately below.');
      refreshCameras(); sessions.refresh();
    } catch (failure) { setError(errorMessage(failure)); refreshCameras(); sessions.refresh(); }
    finally { pendingRef.current = false; setPending(''); }
  }
  const active = sessions.data?.some(value => value.camera === camera.id && value.stopped_at === null) ?? false;
  return <article className="panel stack" aria-label={camera.name}>
    <div className="panel-heading"><div><p className="eyebrow">{camera.kind === 'file_fixture' ? 'Synthetic file fixture' : 'RTSP source'} / {camera.data_provenance}</p><h2>{camera.name}</h2><p className="mono">Source {shortId(camera.id)}</p></div>
      <Status tone={active ? 'info' : 'neutral'}>{active ? 'Session active' : 'No active session'}</Status></div>
    <SourcePreview session={latest} updatedAt={sessions.updatedAt} disconnected={!!sessions.error} />
    <div className="source-health">
      <div className="health-cell"><span>Transport</span><strong>{latest ? healthText(latest.health.transport) : 'Not started'}</strong><p>Desired recording: {camera.desired_recording ? 'ON' : 'OFF'}. This is not transport acknowledgement.</p></div>
      <div className="health-cell"><span>Recording / coverage</span><strong>{latest ? healthText(latest.health.recording) : 'No session'}</strong><p>{captured.success ? `Captured through ${sourceSeconds(captured.data.source_us)}, epoch ${shortId(captured.data.epoch)}` : 'No captured-through watermark provided.'}</p></div>
      <div className="health-cell"><span>Processing / lag</span><strong>{latest ? healthText(latest.health.processing) : 'Not implemented in M01'}</strong><p>No detector or inference watermark is implied by capture or a preview.</p></div>
      <div className="health-cell"><span>Preview freshness</span><strong>{stale ? 'Stale still' : preview ? 'Sealed-source still' : 'Unavailable'}</strong><p>Recording-host mtime, not camera UTC. {latest?.gaps.length ?? 0} recorded coverage gap(s).</p></div>
    </div>
    {sessions.error && <Notice tone="error">Health refresh failed. Last received source facts may be stale. {sessions.error}</Notice>}
    <Facts items={[
      ['Active configuration', config ? `Revision ${config.sequence}` : camera.active_revision ? 'Revision details unavailable' : 'Not configured'],
      ['Source reference', camera.secret_ref], ['Permission reference', camera.permission_ref],
      ['Latest session', latest ? <code>{latest.id}</code> : null],
    ]} />
    <div className="cluster">
      <Button variant="primary" disabled={!!pending || !camera.active_revision || camera.desired_recording} onClick={() => { void control('start'); }}>{pending === 'start' ? 'Requesting…' : 'Start recording'}</Button>
      <Button disabled={!!pending || (!camera.desired_recording && !active)} onClick={() => { void control('stop'); }}>{pending === 'stop' ? 'Requesting…' : 'Stop recording'}</Button>
      <Button disabled={!!pending || !camera.active_revision || !active || !!sessions.error} onClick={() => { void control('reconnect'); }}>{pending === 'reconnect' ? 'Reconnecting…' : 'Reconnect'}</Button>
      <Button disabled={!!pending} onClick={onEdit}>Edit identity</Button>
      <Button disabled={!!pending || revisions.loading || (!!camera.active_revision && !config)} onClick={() => setZoneOpen(true)}>Zones & exclusions</Button>
    </div>
    {!camera.active_revision && <Notice tone="warning">Save a validated geometry revision before starting capture.</Notice>}
    {revisions.error && <Notice tone="error">{revisions.error} <Button onClick={revisions.refresh}>Reload revisions</Button></Notice>}
    {pending === 'reconnect' && <Notice live>{message || 'Requesting stop before reconnect.'}</Notice>}
    {!pending && message && <Notice tone="info" live>{message}</Notice>}
    {error && <Notice tone="error" title="Action not confirmed" live>{error}</Notice>}
    {latest && <details className="stored-facts"><summary>Session clocks, epochs and gaps</summary><Facts items={[
      ['Session status', latest.status], ['Started', timestamp(latest.started_at)], ['Stopped', timestamp(latest.stopped_at)],
    ]} /><JsonFacts value={{ epochs: latest.epochs, gaps: latest.gaps, health: latest.health }} /></details>}
    <ZoneEditor api={api} camera={camera} configuration={config} preview={previewOf(latest)} open={zoneOpen} onClose={() => setZoneOpen(false)} onSaved={() => { revisions.refresh(); refreshCameras(); }} />
  </article>;
}

export function Sources({ api, cameras, sessions }:
  { api: WorkbenchApi; cameras: Resource<Camera[]>; sessions: Resource<Session[]> }) {
  const [editor, setEditor] = useState<Camera | 'new' | null>(null);
  const [acknowledgement, setAcknowledgement] = useState('');
  function sourceSaved(saved: Camera, reconciled: boolean) {
    setAcknowledgement(reconciled ? `Matching stored source: ${saved.name}. No request was retried; the original write acknowledgement is not assumed.` : `Source identity ${saved.name} was saved by the server. Recording state is confirmed separately.`);
    setEditor(null); cameras.refresh();
  }
  return <div className="stack">
    <header className="page-heading"><div><p className="eyebrow">M01 / source workbench</p><h1>Sources & zones</h1><p>Inspect transport, sealed recording, processing and preview independently. Up to two local source identities.</p></div>
      <Button variant="primary" disabled={!cameras.data || cameras.data.length >= 2} onClick={() => setEditor('new')}>+ Register source</Button></header>
    {cameras.error && <Notice tone="error" title="Sources could not be refreshed">{cameras.error} <Button onClick={cameras.refresh}>Retry loading</Button></Notice>}
    {cameras.loading && <Notice live>Loading stored source identities…</Notice>}
    {acknowledgement && <Notice tone="info" live>{acknowledgement}</Notice>}
    {cameras.data?.length === 0 && <div className="panel"><Empty title="No registered sources">Register an existing protected runtime reference, then configure zones. No camera credential or permission has been supplied by this screen.</Empty></div>}
    <div className="source-grid">{cameras.data?.map(camera => <SourceCard key={camera.id} api={api} camera={camera} sessions={sessions} refreshCameras={cameras.refresh} onEdit={() => setEditor(camera)} />)}</div>
    <CameraForm api={api} camera={null} open={editor === 'new'} referencesLocked={false} onOpen={() => setEditor('new')} onClose={() => setEditor(null)} onSaved={sourceSaved} />
    {cameras.data?.map(camera => <CameraForm key={`identity:${camera.id}`} api={api} camera={camera}
      open={editor !== null && editor !== 'new' && editor.id === camera.id}
      referencesLocked={camera.desired_recording || !!sessions.data?.some(session => session.camera === camera.id && !session.stopped_at)}
      onOpen={() => setEditor(camera)} onClose={() => setEditor(null)} onSaved={sourceSaved} />)}
  </div>;
}
