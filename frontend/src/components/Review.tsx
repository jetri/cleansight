import { useEffect, useId, useRef } from 'react';
import { ApiError, errorMessage } from '../api/client';
import type { WorkbenchApi } from '../api/client';
import type { Review, ReviewInput, StoredEvent } from '../api/types';
import { shortId, timestamp } from '../format';
import { Button, Facts, Notice, Select, Status, TextInput } from './ui';

const choices = {
  agree: { label: 'Agree with machine interpretation', state: 'confirmed', reason: 'agree_with_machine' },
  disagree: { label: 'Disagree with machine interpretation', state: 'rejected', reason: 'disagree_with_machine' },
  ambiguous: { label: 'Ambiguous / cannot judge', state: 'under_review', reason: 'ambiguous_evidence' },
  footage: { label: 'Needs better footage', state: 'needs_better_footage', reason: 'insufficient_footage' },
  pending: { label: 'Under review / no judgment yet', state: 'under_review', reason: 'review_pending' },
} as const;
type Choice = keyof typeof choices | '';
export interface ReviewDraft {
  choice: Choice; reason: string; notes: string; reviewer: string; base: string | null;
  version: number; dirty: boolean; phase: 'idle' | 'saving' | 'saved' | 'error' | 'unconfirmed'; message: string;
  attempt?: { input: ReviewInput; version: number; known: string[] };
  acknowledgedId?: string;
}
export type ChangeDraft = (update: (draft: ReviewDraft) => ReviewDraft) => void;

export function reviewHeads(event: StoredEvent): Review[] {
  const corrected = new Set(event.reviews.map(review => review.supersedes_id).filter(Boolean));
  return event.reviews.filter(review => !corrected.has(review.id));
}
export function newReviewDraft(event: StoredEvent): ReviewDraft {
  const heads = reviewHeads(event);
  const current = heads.length === 1 ? heads[0] : undefined;
  const choice = (Object.entries(choices).find(([, value]) => value.reason === current?.reason)?.[0] ?? '') as Choice;
  return { choice, reason: current?.reason ?? '', notes: current?.notes ?? '', reviewer: current?.reviewer_label ?? 'local-operator', base: current?.id ?? null, version: 0, dirty: false, phase: 'idle', message: '' };
}
export function matchingReview(event: StoredEvent, attempt: NonNullable<ReviewDraft['attempt']>): Review | undefined {
  const { input, known } = attempt;
  return event.reviews.find(review => !known.includes(review.id) && review.state === input.state && review.reason === input.reason && review.notes === (input.notes ?? '') && review.reviewer_label === input.reviewer_label && review.supersedes_id === (input.supersedes ?? null));
}

export function ReviewPanel({ api, event, draft, change, refresh }:
  { api: WorkbenchApi; event: StoredEvent; draft: ReviewDraft; change: ChangeDraft; refresh: () => void }) {
  const notesId = useId();
  const lock = useRef(false);
  const heads = reviewHeads(event);
  const waitingForRead = !!draft.acknowledgedId && !event.reviews.some(review => review.id === draft.acknowledgedId);
  const conflict = heads.length > 0 && !heads.some(review => review.id === draft.base) && !waitingForRead;
  const matched = draft.phase === 'unconfirmed' && draft.attempt ? matchingReview(event, draft.attempt) : undefined;
  useEffect(() => {
    if (!matched) return;
    change(previous => ({ ...previous, base: matched.id, acknowledgedId: matched.id,
      phase: previous.version === previous.attempt?.version ? 'saved' : 'idle',
      dirty: previous.version !== previous.attempt?.version,
      message: 'Matching stored feedback was found by a read. No retry was sent; newer draft edits, if any, are retained.',
    }));
  }, [matched, change]);

  function edit(values: Partial<Pick<ReviewDraft, 'choice' | 'reason' | 'notes' | 'reviewer' | 'base'>>) {
    change(previous => ({ ...previous, ...values, version: previous.version + 1, dirty: true,
      phase: previous.phase === 'saved' ? 'idle' : previous.phase,
      message: previous.phase === 'saved' ? 'Previously acknowledged feedback is stored; current edits are unsaved.' : previous.message,
    }));
  }
  async function save(submit: React.SubmitEvent<HTMLFormElement>) {
    submit.preventDefault();
    if (lock.current || draft.phase === 'saving' || draft.phase === 'unconfirmed' || !draft.choice || !draft.dirty || conflict) return;
    const input: ReviewInput = { state: choices[draft.choice].state, reason: draft.reason.trim(), notes: draft.notes, reviewer_label: draft.reviewer.trim(), ...(draft.base ? { supersedes: draft.base } : {}) };
    if (!input.reason || !input.reviewer_label || input.reason.length > 100 || input.reviewer_label.length > 100 || draft.notes.length > 4000) return;
    const attempt = { input, version: draft.version, known: event.reviews.map(review => review.id) };
    lock.current = true;
    change(previous => ({ ...previous, phase: 'saving', message: 'Saving feedback; awaiting server acknowledgement.', attempt }));
    try {
      const result = await api.review(event.id, input);
      const stored = matchingReview(result, attempt);
      if (!stored) throw new ApiError('review_acknowledgement_missing', 'The response did not identify the submitted feedback. Recheck stored history before any retry.', true);
      change(previous => ({ ...previous, base: stored.id, acknowledgedId: stored.id,
        phase: previous.version === attempt.version ? 'saved' : 'idle', dirty: previous.version !== attempt.version,
        message: previous.version === attempt.version ? `Feedback ${shortId(stored.id)} saved by the server.` : `Feedback ${shortId(stored.id)} saved. Newer edits are still unsaved.`,
      }));
      refresh();
    } catch (failure) {
      change(previous => ({ ...previous, phase: failure instanceof ApiError && failure.uncertainWrite ? 'unconfirmed' : 'error', message: errorMessage(failure) }));
      refresh();
    } finally { lock.current = false; }
  }
  return <section className="panel stack" aria-label="Separate human feedback">
    <div className="panel-heading"><div><p className="eyebrow">Human feedback / separate append-only record</p><h2>Review interpretation</h2><p>Feedback does not rewrite machine history, prove a physical fact or activate production.</p></div><Status tone={draft.phase === 'error' || draft.phase === 'unconfirmed' ? 'error' : 'neutral'}>{draft.phase === 'idle' ? draft.dirty ? 'Unsaved draft' : 'No unsaved edits' : draft.phase === 'saved' ? 'Server acknowledged' : `${draft.phase} / draft retained`}</Status></div>
    <form className="stack" onSubmit={submit => { void save(submit); }}>
      <fieldset className="review-options"><legend>Reviewer judgment</legend>{Object.entries(choices).map(([value, choice]) => <label key={value} className="review-option"><input type="radio" name={`review-choice-${event.id}`} value={value} checked={draft.choice === value} onChange={() => edit({ choice: value as Choice, reason: choice.reason })} />{choice.label}</label>)}</fieldset>
      <div className="form-grid"><TextInput label="Reason code" value={draft.reason} onChange={submit => edit({ reason: submit.target.value })} required maxLength={100} />
        <TextInput label="Local reviewer label" hint="A local label, not an authenticated identity." value={draft.reviewer} onChange={submit => edit({ reviewer: submit.target.value })} required maxLength={100} /></div>
      <div className="field"><label htmlFor={notesId}>Review notes</label><textarea id={notesId} rows={4} maxLength={4000} value={draft.notes} onChange={submit => edit({ notes: submit.target.value })} placeholder="What the evidence supports, what is ambiguous, and what remains unobserved." /><small>{draft.notes.length}/4000 · draft stays with this event during polling and selection changes.</small></div>
      {heads.length > 1 && <Select label="Correction base / multiple current feedback records" value={draft.base ?? ''} onChange={submit => edit({ base: submit.target.value || null })}><option value="">Choose the record to correct</option>{heads.map(review => <option key={review.id} value={review.id}>{shortId(review.id)} / {review.state} / {timestamp(review.created_at)}</option>)}</Select>}
      {conflict && <Notice tone="warning" title="Stored feedback changed / draft retained">Review the current records before saving a correction. {heads.length === 1 && <Button onClick={() => edit({ base: heads[0]!.id })}>Use current feedback as correction base / keep draft</Button>}</Notice>}
      {draft.phase === 'unconfirmed' && <Notice tone="warning" title="Write acknowledgement unknown">This backend has no review idempotency key. The draft is retained and resubmission is disabled. Recheck stored history; an exact matching stored record can be adopted without another write.</Notice>}
      {draft.message && <Notice live tone={draft.phase === 'error' || draft.phase === 'unconfirmed' ? 'error' : draft.phase === 'saved' ? 'info' : 'neutral'}>{draft.message}</Notice>}
      <div className="cluster"><Button type="submit" variant="primary" disabled={!draft.dirty || !draft.choice || !draft.reason.trim() || !draft.reviewer.trim() || draft.phase === 'saving' || draft.phase === 'unconfirmed' || conflict || (heads.length > 1 && !draft.base)}>{draft.phase === 'saving' ? 'Saving…' : draft.phase === 'error' ? 'Retry feedback save' : draft.base ? 'Save feedback correction' : 'Save feedback'}</Button><Button onClick={refresh}>Recheck stored history</Button><Button disabled={!draft.dirty || draft.phase === 'saving' || draft.phase === 'unconfirmed'} onClick={() => {
        if (window.confirm('Discard this event’s unsaved feedback draft and load the current stored record?')) change(() => newReviewDraft(event));
      }}>Discard unsaved draft</Button></div>
    </form>
    <details className="stored-facts"><summary>Stored feedback history / {event.reviews.length} record(s)</summary>
      {event.reviews.length === 0 ? <p className="muted">No feedback has been stored.</p> : <ol className="history-list">{[...event.reviews].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)).map(review => <li key={review.id} className="history-row"><time dateTime={review.created_at}>{timestamp(review.created_at)}</time><div><h3>{review.state} / {review.reason}</h3><p>{review.notes || 'No notes provided.'}</p><Facts items={[
        ['Reviewer label', review.reviewer_label], ['Feedback ID', <code>{shortId(review.id)}</code>], ['Corrects', review.supersedes_id ? <code>{shortId(review.supersedes_id)}</code> : 'Independent initial record'],
      ]} /></div></li>)}</ol>}
    </details>
  </section>;
}
