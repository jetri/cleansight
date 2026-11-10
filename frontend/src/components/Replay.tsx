import { useRef, useState } from 'react';
import { ApiError, errorMessage } from '../api/client';
import type { WorkbenchApi } from '../api/client';
import { identity } from '../api/types';
import type { Camera, Run, RunSummary, Session } from '../api/types';
import { shortId, sourceSeconds, timestamp } from '../format';
import type { Resource } from '../hooks';
import { FrameInspector } from './FrameInspector';
import { Button, Empty, Facts, JsonFacts, Modal, Notice, Select, Status } from './ui';

function savedRunSelection() {
  const candidate = identity.safeParse(new URLSearchParams(window.location.search).get('run'));
  return candidate.success ? candidate.data : '';
}

export function Replay({ api, cameras, sessions, runs, active }:
  { api: WorkbenchApi; cameras: Resource<Camera[]>; sessions: Resource<Session[]>; runs: Resource<RunSummary[]>; active: boolean }) {
  const [sessionId, setSessionId] = useState('');
  const [runId, setRunId] = useState(savedRunSelection);
  const [mode, setMode] = useState<Run['mode']>('media_replay');
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [ack, setAck] = useState<Run | null>(null);
  const [uncertain, setUncertain] = useState<{ session: string; mode: Run['mode']; existing: Set<string> } | null>(null);
  const lock = useRef(false);
  const summary = runs.data?.find(run => run.id === runId);
  const selectedSession = sessions.data?.find(session => session.id === sessionId);
  const recent = ack?.id === runId ? ack : null;
  const sourceSessionId = summary?.session_id ?? recent?.input_manifest.session;
  const sourceSession = sessions.data?.find(session => session.id === sourceSessionId);
  const sourceCamera = cameras.data?.find(camera => camera.id === sourceSession?.camera);
  const unresolved = uncertain?.session === sessionId && uncertain.mode === mode;
  const discovered = uncertain ? runs.data?.filter(run => !uncertain.existing.has(run.id) && run.session_id === uncertain.session && run.mode === uncertain.mode) ?? [] : [];
  function chooseRun(id: string) {
    setRunId(id);
    const url = new URL(window.location.href); url.searchParams.set('run', id);
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  }
  async function createRun() {
    if (lock.current || !sessionId || unresolved) return;
    lock.current = true; setPending(true); setError('');
    const existing = new Set(runs.data?.map(run => run.id));
    try {
      const result = await api.replay(sessionId, mode);
      setAck(result); chooseRun(result.id); setOpen(false); runs.refresh();
    } catch (failure) {
      setError(errorMessage(failure));
      if (failure instanceof ApiError && failure.uncertainWrite) {
        setUncertain({ session: sessionId, mode, existing }); runs.refresh();
      }
    } finally { lock.current = false; setPending(false); }
  }
  return <div className="stack">
    <header className="page-heading"><div><p className="eyebrow">M01 / source-clock preserving replay</p><h1>Capture & replay</h1><p>Create a new frozen run from catalogued local recording. Replay identity changes; source identity, epochs and original clock do not.</p></div>
      <Button variant="primary" disabled={!sessions.data?.length} onClick={() => setOpen(true)}>Create replay run</Button></header>
    <Notice tone="info">No detector starts from replay. Source-frame inspection uses the persisted index; browser video playback uses derived event clips, not a fake video or an assumed raw-TS format.</Notice>
    {sessions.error && <Notice tone="error">Sessions could not be refreshed. {sessions.error} <Button onClick={sessions.refresh}>Reload sessions</Button></Notice>}
    {sessions.loading && <Notice live>Loading captured sessions…</Notice>}
    {!sessions.loading && sessions.data?.length === 0 && <div className="panel"><Empty title="No captured sessions">Start a configured source in Sources & zones. No recording or replay success is implied by an empty catalog.</Empty></div>}
    {!!sessions.data?.length && <section className="panel stack"><div className="panel-heading"><div><h2>Captured sessions</h2><p>Latest 100. Capture coverage is separate from fixture/inference processing.</p></div><Button onClick={sessions.refresh}>Refresh sessions</Button></div>
      <div className="table-scroll"><table><thead><tr><th>Source / session</th><th>Capture state</th><th>Source coverage</th><th>Replay</th></tr></thead><tbody>{sessions.data.map(session => {
        const camera = cameras.data?.find(camera => camera.id === session.camera);
        const through = session.health.captured_through;
        const watermark = through && typeof through === 'object' && 'source_us' in through && typeof through.source_us === 'number' ? through.source_us : null;
        return <tr key={session.id}><td><strong>{camera?.name ?? 'Source identity unavailable'}</strong><br /><code>{shortId(session.id)}</code><br /><span className="muted">{session.provenance}</span></td><td><Status>{session.status}</Status><br />{timestamp(session.started_at)}</td><td>Captured through {sourceSeconds(watermark)}<br />{session.epochs.length} epoch(s) · {session.gaps.length} explicit gap(s)</td><td><Button onClick={() => { setSessionId(session.id); setOpen(true); }}>New run from session</Button></td></tr>;
      })}</tbody></table></div>
    </section>}
    <section className="panel stack"><div className="panel-heading"><div><h2>Stored replay runs</h2><p>A reload discovers stored IDs, not an in-memory sample event wall.</p></div><Button onClick={runs.refresh}>Reload runs</Button></div>
      {runs.error && <Notice tone="error">{runs.error}</Notice>}
      {runs.loading && <Notice live>Loading stored runs…</Notice>}
      <Select label="Selected run" value={runId} onChange={event => chooseRun(event.target.value)}><option value="">Choose a stored run</option>
        {runId && !runs.data?.some(run => run.id === runId) && <option value={runId}>{shortId(runId)} / metadata pending or outside latest 100</option>}
        {runs.data?.map(run => <option key={run.id} value={run.id}>{shortId(run.id)} / {run.mode === 'observation_fixture' ? 'OBSERVATION FIXTURE' : 'media replay'} / session {shortId(run.session_id)}</option>)}
      </Select>
      {runId ? <><Facts items={[
        ['Run identity', <code>{runId}</code>], ['Original source', sourceCamera?.name ?? null],
        ['Source session', sourceSessionId ? <code>{sourceSessionId}</code> : null],
        ['Pinned configuration', <code>{summary?.configuration_id ?? recent?.configuration ?? 'Unavailable'}</code>],
        ['Mode / provenance', summary?.mode ?? recent?.mode ?? null], ['Run created', timestamp(summary?.created_at)],
      ]} /><Notice tone="warning">A fixture run is observation-injection/history plumbing, not model output, physical contact proof or accuracy evidence. Production remains OFF.</Notice>
        <JsonFacts value={{ versions: summary?.versions ?? recent?.versions ?? null, ...(recent ? { pinned_manifest: recent.input_manifest } : {}) }} title="Stored versions and available manifest" />
      </> : <Empty title="No run selected">Choose a stored run or create a new one from an actual captured session.</Empty>}
    </section>
    {runId && <div hidden={!active}><FrameInspector key={runId} api={api} run={runId} /></div>}
    <Modal open={open} title="Create local replay run" onRequestClose={() => { if (!lock.current) setOpen(false); }} actions={<>
      <Button disabled={pending} onClick={() => setOpen(false)}>Close / retain selection</Button><Button variant="primary" disabled={pending || !sessionId || unresolved} onClick={() => { void createRun(); }}>{pending ? 'Creating…' : 'Create new run'}</Button>
    </>}>
      <div className="stack"><Notice tone="info">This stores a new run ID and pins its current source manifest and configuration. It does not start a detector, alter source timestamps or upload media.</Notice>
        <Select label="Captured source session" value={sessionId} onChange={event => setSessionId(event.target.value)} disabled={pending}><option value="">Choose a captured session</option>{sessions.data?.map(session => <option key={session.id} value={session.id}>{cameras.data?.find(camera => camera.id === session.camera)?.name ?? shortId(session.camera)} / {shortId(session.id)} / {session.provenance}</option>)}</Select>
        <Select label="Run mode" value={mode} onChange={event => setMode(event.target.value as Run['mode'])} disabled={pending}><option value="media_replay">Media replay / indexed inspection</option><option value="observation_fixture">Observation fixture / NOT MODEL EVIDENCE</option></Select>
        {selectedSession && <Facts items={[
          ['Original session', <code>{selectedSession.id}</code>], ['Session configuration', <code>{selectedSession.configuration}</code>], ['Recorded gaps', selectedSession.gaps.length],
        ]} />}
        {error && <Notice tone="error" title={unresolved ? 'Run acknowledgement unknown / no retry sent' : 'Run not created'} live>{error}</Notice>}
        {unresolved && <><Notice tone="warning">This backend has no replay idempotency key. The same request is disabled rather than blindly duplicated. Recheck stored runs; adopting a discovered run does not claim which request created it.</Notice><Button onClick={runs.refresh}>Recheck stored runs</Button>
          {discovered.map(run => <Button key={run.id} onClick={() => { chooseRun(run.id); setOpen(false); }}>Inspect discovered run {shortId(run.id)}</Button>)}
        </>}
      </div>
    </Modal>
  </div>;
}
