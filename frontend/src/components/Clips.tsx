import { useEffect, useRef } from 'react';
import { z } from 'zod';
import { ApiError, errorMessage } from '../api/client';
import type { WorkbenchApi } from '../api/client';
import { identity, sourceTime } from '../api/types';
import type { Clip, StoredEvent } from '../api/types';
import { parseSourceInput, shortId, sourceInput, sourceSeconds } from '../format';
import { EvidenceVideo } from './Media';
import { Button, Empty, Facts, JsonFacts, Notice, Select, Status, TextInput } from './ui';

const span = z.tuple([z.number().int(), z.number().int()]);
export const coverageSchema = z.object({
  available: z.array(z.tuple([sourceTime, sourceTime])), missing: z.array(span),
  required_missing: z.array(span), parts: z.array(identity), reason: z.string(),
});
export function clipCoverage(clip: Clip | null) {
  const parsed = coverageSchema.safeParse(clip?.coverage);
  return parsed.success ? parsed.data : null;
}
export interface ClipDraft {
  start: string; end: string; clipId: string | null; partId: string | null; selectionVersion: number;
  phase: 'idle' | 'saving' | 'acknowledged' | 'error' | 'unconfirmed'; message: string; acknowledged?: Clip;
  attempt?: { start: number; end: number; known: string[]; selectionVersion: number };
}
export type ChangeClip = (update: (draft: ClipDraft) => ClipDraft) => void;
export function newClipDraft(event: StoredEvent): ClipDraft {
  const times = [event.release_us, ...event.transitions.map(transition => transition.source_us)];
  return { start: sourceInput(Math.min(...times)), end: sourceInput(Math.max(...times) + 1), clipId: null, partId: null, selectionVersion: 0, phase: 'idle', message: '' };
}

export function ClipPanel({ api, event, draft, change, refresh, active, positions }:
  { api: WorkbenchApi; event: StoredEvent; draft: ClipDraft; change: ChangeClip; refresh: () => void; active: boolean; positions: Map<string, number> }) {
  const lock = useRef(false);
  const clip = event.clips.find(clip => clip.id === draft.clipId) ?? (draft.acknowledged?.id === draft.clipId ? draft.acknowledged : null);
  const coverage = clipCoverage(clip);
  const ordered = coverage && coverage.parts.length === coverage.available.length ? coverage.parts : [];
  const partId = draft.partId && ordered.includes(draft.partId) ? draft.partId : ordered[0];
  const start = parseSourceInput(draft.start), end = parseSourceInput(draft.end);
  const valid = start !== null && end !== null && start <= event.release_us && end > event.release_us && end - start <= 300_000_000;
  const pending = draft.phase === 'saving';
  const matched = draft.phase === 'unconfirmed' && draft.attempt ? event.clips.find(clip => !draft.attempt!.known.includes(clip.id) && clip.required[0] === draft.attempt!.start && clip.required[1] === draft.attempt!.end) : undefined;
  useEffect(() => {
    if (!draft.clipId && event.clips.length) {
      const latest = [...event.clips].sort((a, b) => b.revision - a.revision)[0]!;
      change(previous => previous.clipId ? previous : { ...previous, clipId: latest.id });
    }
  }, [draft.clipId, event.clips, change]);
  useEffect(() => {
    if (!matched) return;
    change(previous => ({ ...previous, phase: 'acknowledged', acknowledged: matched,
      clipId: previous.selectionVersion === previous.attempt?.selectionVersion ? matched.id : previous.clipId,
      partId: previous.selectionVersion === previous.attempt?.selectionVersion ? null : previous.partId,
      message: 'Matching stored clip job found. No retry was sent; media availability is separate.',
    }));
  }, [matched, change]);
  async function request(submit: React.SubmitEvent<HTMLFormElement>) {
    submit.preventDefault();
    if (lock.current || pending || draft.phase === 'unconfirmed' || !valid || start === null || end === null) return;
    const attempt = { start, end, known: event.clips.map(clip => clip.id), selectionVersion: draft.selectionVersion };
    lock.current = true; change(previous => ({ ...previous, phase: 'saving', message: 'Requesting a new immutable clip revision…', attempt }));
    try {
      const value = await api.requestClip(event.id, start, end);
      change(previous => ({ ...previous, phase: 'acknowledged', acknowledged: value,
        clipId: previous.selectionVersion === attempt.selectionVersion ? value.id : previous.clipId,
        partId: previous.selectionVersion === attempt.selectionVersion ? null : previous.partId,
        message: `Clip revision ${value.revision} was acknowledged by the server (${value.status}). This is not a claim that its media is available.`,
      }));
      refresh();
    } catch (failure) {
      change(previous => ({ ...previous, phase: failure instanceof ApiError && failure.uncertainWrite ? 'unconfirmed' : 'error', message: errorMessage(failure) }));
      refresh();
    } finally { lock.current = false; }
  }
  return <section className="stack" aria-label="Clip revisions and coverage">
    <div className="panel clip-toolbar"><div className="clip-toolbar-main"><h2>Evidence media</h2>
      <Status tone={clip?.status === 'partial' || clip?.status === 'failed' ? 'error' : 'neutral'}>{clip?.status ?? 'No clip selected'}</Status>
      <Select label="Clip revision" value={draft.clipId ?? ''} onChange={submit => change(previous => ({ ...previous, clipId: submit.target.value || null, partId: null, selectionVersion: previous.selectionVersion + 1 }))}>
        <option value="">Choose a stored clip revision</option>{event.clips.map(clip => <option key={clip.id} value={clip.id}>Revision {clip.revision} / {clip.status} / {shortId(clip.id)}</option>)}
        {draft.acknowledged && !event.clips.some(clip => clip.id === draft.acknowledged!.id) && <option value={draft.acknowledged.id}>Revision {draft.acknowledged.revision} / {draft.acknowledged.status} / acknowledgement received</option>}
      </Select>
      {ordered.length > 1 && <Select label="Chronological recorded part / never auto-cross gaps" value={partId} onChange={submit => change(previous => ({ ...previous, partId: submit.target.value, selectionVersion: previous.selectionVersion + 1 }))}>{ordered.map((id, index) => <option key={id} value={id}>Part {index + 1} / {sourceSeconds(coverage!.available[index]![0])} to {sourceSeconds(coverage!.available[index]![1])}</option>)}</Select>}
    </div>
      {coverage && <p className={`clip-toolbar-note ${coverage.required_missing.length ? 'coverage-alert' : ''}`}>
        {ordered.length === 1 && <>Part 1: {sourceSeconds(coverage.available[0]![0])} to {sourceSeconds(coverage.available[0]![1])}. </>}
        {coverage.required_missing.length} required missing / {coverage.missing.length} contextual missing span(s). No automatic gap crossing.
      </p>}
    </div>
    {partId ? <EvidenceVideo key={partId} api={api} id={partId} active={active} positions={positions} />
      : <div className="panel"><Empty title={clip?.status === 'queued' || clip?.status === 'running' ? 'Clip media pending' : 'No playable ordered part'}>No media is substituted. Request a clip below, or inspect source-indexed frames. Missing part/source-span metadata is not repaired by guessing media-ID order.</Empty></div>}
    <details className="panel"><summary>Coverage, source spans & new clip revisions</summary><div className="stack">
      {clip && <><Facts items={[
        ['Requested context', `${sourceSeconds(clip.requested[0])} to ${sourceSeconds(clip.requested[1])}`],
        ['Required inspection span', `${sourceSeconds(clip.required[0])} to ${sourceSeconds(clip.required[1])}`],
        ['Required media coverage', coverage ? coverage.required_missing.length ? `${coverage.required_missing.length} missing span(s)` : 'No required missing spans reported' : 'Unavailable / pending'],
      ]} />
        {coverage && (coverage.missing.length > 0 || coverage.required_missing.length > 0) && <Notice tone="error" title="Coverage is partial / gaps are not observations">Parts are separate files, not seamlessly joined. Inspect required versus contextual gaps below; ambiguous pixels and absent media are different.</Notice>}
        <JsonFacts value={clip.coverage} title="Required, available, missing and corrupt-source spans" />
      </>}
      <details className="stored-facts"><summary>{event.clips.length ? 'Request a new clip extension / revision' : 'Request a source-context clip'}</summary>
        <form className="stack" onSubmit={submit => { void request(submit); }}><Notice>Required times are epoch-source seconds, not video elapsed time or UTC. The server expands context to 15s before release and at least 45s after, through the required end. Missing pre-roll stays explicitly missing.</Notice>
          <div className="form-grid"><TextInput label="Required start (source seconds)" inputMode="decimal" value={draft.start} disabled={pending || draft.phase === 'unconfirmed'} onChange={submit => change(previous => ({ ...previous, start: submit.target.value }))} />
            <TextInput label="Required end, exclusive (source seconds)" inputMode="decimal" value={draft.end} disabled={pending || draft.phase === 'unconfirmed'} onChange={submit => change(previous => ({ ...previous, end: submit.target.value }))} /></div>
          {!valid && <Notice tone="error">Use nonnegative decimal seconds with at most six fractional digits. The required span must contain release, end after release, and be at most five minutes. Inputs are retained.</Notice>}
          <Button type="submit" variant="primary" disabled={!valid || pending || draft.phase === 'unconfirmed'}>{pending ? 'Requesting…' : 'Request new clip revision'}</Button>
        </form>
      </details>
    </div></details>
    {draft.phase === 'unconfirmed' && <Notice tone="warning" title="Job acknowledgement unknown / no blind retry">This backend has no clip-job idempotency key. Inputs are retained and resubmission is disabled. <Button onClick={refresh}>Recheck stored clip revisions</Button></Notice>}
    {draft.message && <Notice live tone={draft.phase === 'error' || draft.phase === 'unconfirmed' ? 'error' : draft.phase === 'acknowledged' ? 'info' : 'neutral'}>{draft.message}</Notice>}
  </section>;
}
