import { useCallback, useEffect, useRef, useState } from 'react';
import type { WorkbenchApi } from '../api/client';
import { identity } from '../api/types';
import type { Camera, EventFilters, RunSummary, Session, StoredEvent } from '../api/types';
import { outcomeTone, relativeTime, shortId, sourceSeconds, timestamp } from '../format';
import { useResource } from '../hooks';
import type { Resource } from '../hooks';
import { ClipPanel, clipCoverage, newClipDraft } from './Clips';
import type { ClipDraft, ChangeClip } from './Clips';
import { FrameInspector } from './FrameInspector';
import { ReviewPanel, newReviewDraft, reviewHeads } from './Review';
import type { ChangeDraft, ReviewDraft } from './Review';
import { Button, Empty, Facts, JsonFacts, Notice, Select, Status, TextInput } from './ui';

const outcomes = ['NO_EVENT', 'INTERACTION_CANDIDATE', 'RELEASE_CANDIDATE', 'LANDING_CANDIDATE', 'STABILIZED', 'RETRIEVAL_WINDOW', 'CONFIRMATION_CHECK', 'UNCERTAIN', 'REJECTED', 'INCOMPLETE'] as const;
const initialFilters: EventFilters = { camera: '', outcome: '', reason: '', phase: '' };
function initialEvent() {
  const result = identity.safeParse(new URLSearchParams(window.location.search).get('event'));
  return result.success ? result.data : '';
}
function sourceFor(event: StoredEvent, cameras: Camera[] | null, sessions: Session[] | null, runs: RunSummary[] | null) {
  const run = runs?.find(run => run.id === event.run);
  const session = sessions?.find(session => session.id === run?.session_id);
  return cameras?.find(camera => camera.id === session?.camera) ?? null;
}

function EventDetail({ api, event, source, reviewDraft, changeReview, clipDraft, changeClip, refresh, active, positions }:
  { api: WorkbenchApi; event: StoredEvent; source: Camera | null; reviewDraft: ReviewDraft; changeReview: ChangeDraft; clipDraft: ClipDraft; changeClip: ChangeClip; refresh: () => void; active: boolean; positions: Map<string, number> }) {
  const history = [...event.transitions].sort((a, b) => a.sequence - b.sequence);
  const last = history.at(-1);
  const stabilized = history.find(transition => transition.state === 'STABILIZED');
  const heads = reviewHeads(event);
  const clip = clipDraft.clipId
    ? event.clips.find(clip => clip.id === clipDraft.clipId) ?? (clipDraft.acknowledged?.id === clipDraft.clipId ? clipDraft.acknowledged : null)
    : [...event.clips].sort((a, b) => b.revision - a.revision)[0] ?? null;
  const coverage = clipCoverage(clip);
  const coverageLabel = coverage ? coverage.required_missing.length ? 'Required media missing' : coverage.missing.length ? 'Required spans present / context partial' : 'No missing spans reported' : clip ? `${clip.status} / coverage unverified` : 'No clip coverage stored';
  return <div className="stack">
    <section className="event-summary" aria-label="Selected event summary before evidence">
      <header className="event-header"><div><p className="eyebrow">{source?.name ?? 'Source identity unavailable from bounded catalog'}</p><h2>Event {shortId(event.id)}</h2></div><div className="cluster"><Status tone={outcomeTone(event.machine_outcome)}>{event.machine_outcome}</Status><Status>{event.phase.toUpperCase()}</Status></div></header>
      <div className="event-fixture-line"><span className="fixture-caption">{event.label}</span><span className="muted">Human review: <strong>{heads.length === 0 ? 'No stored review' : heads.length === 1 ? heads[0]!.state.replaceAll('_', ' ') : `${heads.length} current feedback records`}</strong></span></div>
      <div className="event-reason"><span className="small muted">Retained reason</span><strong>{last?.reason ?? 'No transition or reason stored yet'}</strong></div>
      <Facts items={[
        ['Object observation', 'Unavailable / no typed backend projection'],
        ['Media coverage', <Status tone={coverage?.required_missing.length ? 'error' : coverage?.missing.length ? 'warning' : 'neutral'}>{coverageLabel}</Status>],
      ]} />
    </section>
    <section className="stack" aria-label="Separate source-time policy clocks">
      <div className="clock-grid">
        <div className="clock-card"><p className="eyebrow">Clock 1 / stabilization → retrieval</p><h3>Run-pinned deadline unavailable</h3><p>{stabilized ? `Reported STABILIZED source ${sourceSeconds(stabilized.source_us)}; durations not pinned.` : 'No STABILIZED source timestamp stored.'}</p><p className="muted">No deadline or gate pass is inferred.</p></div>
        <div className="clock-card"><p className="eyebrow">Clock 2 / release → third party</p><h3>Early-removal interval unavailable</h3><p>Release source {sourceSeconds(event.release_us)}; no default interval.</p><p className="muted">Removal/contact bracket and continuity unavailable.</p></div>
      </div>
      <p className="small muted">Policy reference, not run validation: 3s stabilization, then 30s retrieval from its completion, inclusive. Early-removal policy needs its own pinned interval.</p>
    </section>
    <ClipPanel api={api} event={event} draft={clipDraft} change={changeClip} refresh={refresh} active={active} positions={positions} />
    <details className="stored-facts"><summary>Provenance, pinned revisions and unavailable inspection fields</summary><div className="stack"><Facts items={[
      ['Event', <code>{event.id}</code>], ['Run', <code>{event.run}</code>], ['Configuration', <code>{event.configuration}</code>],
      ['Epoch', <code>{event.epoch}</code>], ['Release source time', sourceSeconds(event.release_us)], ['Source provenance', source?.data_provenance ?? null], ['Production activation', 'OFF / disabled'],
    ]} /><Notice>Object present/retrieved/third-party removed/unobserved, gates, uncertainty brackets, overlays and crops require a supported backend projection. M01 retains raw transition evidence below; this UI does not invent missing facts or infer contact from pixels. Unavailable is not an observed absence or a passed gate. Walk-away alone is not disqualifying; ambiguous pixels and missing media remain distinct.</Notice></div></details>
    <details className="panel"><summary>Source-indexed frame inspection / epoch {shortId(event.epoch)}</summary><FrameInspector api={api} run={event.run} epoch={event.epoch} /></details>
    <section className="panel stack" aria-label="Full chronological state transition history"><div className="panel-heading"><div><p className="eyebrow">Append-only fixture history / source and processing clocks</p><h2>State transitions</h2><p>All stored stages are shown in sequence. Later unobserved stages are not rendered as passed.</p></div><Status>{history.length} transition(s)</Status></div>
      {history.length === 0 ? <Empty title="No state transitions stored">NO_EVENT does not establish a physical observation. No later gate is assumed.</Empty> : <ol className="history-list">{history.map(transition => <li className="history-row" key={transition.id}>
        <div><span className="eyebrow">Source time</span><br /><time>{sourceSeconds(transition.source_us)}</time><br /><span className="small muted">{relativeTime(transition.source_us, event.release_us)} from release</span></div>
        <div><h3>{transition.state}</h3><p><strong>{transition.reason}</strong></p><p>{transition.previous} → {transition.state} · sequence {transition.sequence}</p>
          <p>Processing <time dateTime={transition.processing_at}>{timestamp(transition.processing_at)}</time> · {transition.provenance}</p><JsonFacts value={transition.evidence} title="Stored evidence, reasons and any supplied gate/span facts" /></div>
      </li>)}</ol>}
    </section>
    <ReviewPanel api={api} event={event} draft={reviewDraft} change={changeReview} refresh={refresh} />
  </div>;
}

export function EvidenceDesk({ api, cameras, sessions, runs, active, onSources }:
  { api: WorkbenchApi; cameras: Resource<Camera[]>; sessions: Resource<Session[]>; runs: Resource<RunSummary[]>; active: boolean; onSources: () => void }) {
  const [filters, setFilters] = useState<EventFilters>(initialFilters);
  const [selectedId, setSelectedId] = useState(initialEvent);
  const [drafts, setDrafts] = useState<Record<string, ReviewDraft>>({});
  const [clipDrafts, setClipDrafts] = useState<Record<string, ClipDraft>>({});
  const positions = useRef(new Map<string, number>());
  const loadQueue = useCallback((signal: AbortSignal) => api.queue(filters, signal), [api, filters]);
  const queue = useResource(`event-queue:${JSON.stringify(filters)}`, loadQueue);
  const loadEvent = useCallback((signal: AbortSignal) => api.event(selectedId, signal), [api, selectedId]);
  const detail = useResource(`event:${selectedId}`, loadEvent, { enabled: !!selectedId, interval: 3_000 });
  const selectEvent = useCallback((id: string) => {
    setSelectedId(id);
    const url = new URL(window.location.href); url.searchParams.set('event', id);
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  }, []);
  useEffect(() => { if (!selectedId && queue.data?.length) selectEvent(queue.data[0]!.id); }, [selectedId, queue.data, selectEvent]);
  const unsaved = Object.values(drafts).some(draft => draft.dirty || draft.phase === 'saving' || draft.phase === 'unconfirmed') || Object.values(clipDrafts).some(draft => draft.phase === 'saving' || draft.phase === 'unconfirmed');
  useEffect(() => {
    if (!unsaved) return;
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [unsaved]);
  const event = detail.data;
  const refreshDetail = detail.refresh, refreshQueue = queue.refresh;
  const refresh = useCallback(() => { refreshDetail(); refreshQueue(); }, [refreshDetail, refreshQueue]);
  const changeReview = useCallback((update: (draft: ReviewDraft) => ReviewDraft) => {
    if (!event) return;
    setDrafts(previous => ({ ...previous, [event.id]: update(previous[event.id] ?? newReviewDraft(event)) }));
  }, [event]);
  const changeClip = useCallback((update: (draft: ClipDraft) => ClipDraft) => {
    if (!event) return;
    setClipDrafts(previous => ({ ...previous, [event.id]: update(previous[event.id] ?? newClipDraft(event)) }));
  }, [event]);
  return <div className="stack">
    <header className="page-heading"><div><p className="eyebrow">M01 / inspect evidence, not people</p><h1>Evidence desk</h1></div><Button onClick={refresh}>Refresh evidence</Button></header>
    {cameras.data?.length === 0 && <Notice tone="info" title="No sources registered">Begin with a protected local source reference. <Button onClick={onSources}>Open Sources & zones</Button></Notice>}
    <div className="inspection-layout">
      <aside className="panel queue-panel" aria-label="Fixture event queue"><div className="queue-heading"><p className="eyebrow">Observation fixtures / not model evidence</p><h2>Event queue</h2><p className="small muted">Latest 100 matching records.</p></div>
        <div className="queue-filters"><Select label="Camera filter" value={filters.camera} onChange={submit => setFilters(previous => ({ ...previous, camera: submit.target.value }))}><option value="">All sources</option>{cameras.data?.map(camera => <option key={camera.id} value={camera.id}>{camera.name}</option>)}</Select>
          <Select label="Machine outcome filter" value={filters.outcome} onChange={submit => setFilters(previous => ({ ...previous, outcome: submit.target.value }))}><option value="">All machine states</option>{outcomes.map(outcome => <option key={outcome} value={outcome}>{outcome}</option>)}</Select>
          <Select label="Phase filter" value={filters.phase} onChange={submit => setFilters(previous => ({ ...previous, phase: submit.target.value }))}><option value="">Provisional + final</option><option value="provisional">Provisional only</option><option value="final">Final only</option></Select>
          <TextInput label="Reason code filter (exact)" value={filters.reason} onChange={submit => setFilters(previous => ({ ...previous, reason: submit.target.value }))} maxLength={100} placeholder="All retained reasons" />
        </div>
        {queue.loading && <Notice live>Loading stored fixture records…</Notice>}
        {queue.error && <Notice tone="error">Queue refresh failed. Last received records may be stale. {queue.error} <Button onClick={queue.refresh}>Retry loading</Button></Notice>}
        {queue.data?.length === 0 && <Empty title="No matching fixture events">No successful event wall is substituted. Change filters or create observation fixtures through the documented local backend test path.</Empty>}
        <ul className="queue-list">{queue.data?.map(event => <li key={event.id}><button type="button" className="queue-item" aria-pressed={selectedId === event.id} onClick={() => selectEvent(event.id)} aria-label={`Inspect event ${shortId(event.id)}, ${event.machine_outcome}, ${event.phase}`}>
          <div className="cluster cluster--between"><strong>{shortId(event.id)}</strong><span className="small">{event.phase}</span></div><Status tone={outcomeTone(event.machine_outcome)}>{event.machine_outcome}</Status>
          <p>{sourceFor(event, cameras.data, sessions.data, runs.data)?.name ?? 'Source unavailable'} · release {sourceSeconds(event.release_us)}</p><p>{event.transitions.at(-1)?.reason ?? 'No retained reason yet'}</p>
        </button></li>)}</ul>
      </aside>
      <div className="stack">
        {selectedId && queue.data && !queue.loading && !queue.data.some(event => event.id === selectedId) && <Notice>Selection is outside the current queue filters. Its detail, media and drafts are retained.</Notice>}
        {detail.loading && <Notice live>Loading selected event details…</Notice>}
        {detail.error && <Notice tone="error" title="Event detail could not be refreshed">{detail.error} Last received facts may be stale; no new physical inference is made. <Button onClick={detail.refresh}>Retry detail loading</Button></Notice>}
        {event ? <EventDetail key={event.id} api={api} event={event} source={sourceFor(event, cameras.data, sessions.data, runs.data)} reviewDraft={drafts[event.id] ?? newReviewDraft(event)} changeReview={changeReview} clipDraft={clipDrafts[event.id] ?? newClipDraft(event)} changeClip={changeClip} refresh={refresh} active={active} positions={positions.current} />
          : !detail.loading && <div className="panel"><Empty title="No event selected">Select an actual stored fixture record. Unknown, provisional, rejected and incomplete outcomes remain inspectable without fabricated physical facts.</Empty></div>}
      </div>
    </div>
  </div>;
}
