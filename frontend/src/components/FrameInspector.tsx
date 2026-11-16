import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage, mediaUrl } from '../api/client';
import type { WorkbenchApi } from '../api/client';
import type { Cursor, IndexedFrame } from '../api/types';
import { shortId, sourceSeconds } from '../format';
import { useResource } from '../hooks';
import { ArtifactFacts } from './Media';
import { frameKey, useFrameRequests } from './FrameRequests';
import { Button, Empty, Facts, JsonFacts, Notice } from './ui';

export function FrameInspector({ api, run, epoch }:
  { api: WorkbenchApi; run: string; epoch?: string }) {
  const [pages, setPages] = useState<Cursor[]>([{ segment: 0, frame: 0 }]);
  const cursor = pages[pages.length - 1]!;
  const load = useCallback((signal: AbortSignal) => api.timeline(run, cursor, signal), [api, run, cursor]);
  const timeline = useResource(`timeline:${run}:${cursor.segment}:${cursor.frame}`, load, { interval: 0 });
  const frames = timeline.data?.frames.filter((frame): frame is IndexedFrame => 'frame' in frame && (!epoch || frame.epoch === epoch)) ?? [];
  const [selected, setSelected] = useState<IndexedFrame | null>(null);
  const [jobId, setJobId] = useState('');
  const [requested, setRequested] = useState<IndexedFrame | null>(null);
  const [pending, setPending] = useState(false);
  const [poll, setPoll] = useState(true);
  const [error, setError] = useState('');
  const { requests, request } = useFrameRequests();
  const [failedImage, setFailedImage] = useState('');
  const [imageRevision, setImageRevision] = useState(0);
  const pendingRef = useRef(false);
  const loadJob = useCallback((signal: AbortSignal) => api.frame(jobId, signal), [api, jobId]);
  const job = useResource(`frame-job:${jobId}`, loadJob, { enabled: !!jobId, interval: poll ? 1_000 : 0 });
  useEffect(() => {
    if (job.data && ['available', 'failed'].includes(job.data.status)) setPoll(false);
  }, [job.data]);
  const blocked = (frame: IndexedFrame | undefined) => !!frame && requests.has(frameKey(frame));
  const unconfirmed = frames.some(frame => requests.get(frameKey(frame)) === 'unknown');
  async function inspect(frame: IndexedFrame) {
    if (pendingRef.current || blocked(frame)) return;
    pendingRef.current = true; setPending(true); setError(''); setSelected(frame);
    try {
      const value = await request(frame);
      if (value) { setRequested(frame); setJobId(value.id); setPoll(true); setFailedImage(''); }
    } catch (failure) {
      setError(errorMessage(failure));
    } finally { pendingRef.current = false; setPending(false); }
  }
  const selectedIndex = selected ? frames.findIndex(frame => frameKey(frame) === frameKey(selected)) : -1;
  const jobPending = !!jobId && !['available', 'failed'].includes(job.data?.status ?? '');
  const busy = pending || jobPending;
  const media = job.data?.status === 'available' ? job.data.media : null;
  return <section className="stack" aria-label="Source-indexed frame inspection">
    <div className="panel stack">
      <div className="panel-heading"><div><p className="eyebrow">Exact source index / no inferred frame rate</p><h3>Frame inspection</h3><p>Frames resolve at or after an actual indexed source time. Ordinary video seeking is not guaranteed frame-accurate.</p></div><Button onClick={timeline.refresh}>Reload index</Button></div>
      {timeline.loading && <Notice live>Loading the frozen run's source index…</Notice>}
      {timeline.error && <Notice tone="error">{timeline.error}</Notice>}
      <div className="cluster">
        <Button disabled={busy || selectedIndex <= 0 || blocked(frames[selectedIndex - 1])} onClick={() => { const frame = frames[selectedIndex - 1]; if (frame) { void inspect(frame); } }}>Previous indexed frame</Button>
        <Button disabled={busy || !frames.length || selectedIndex >= frames.length - 1 || blocked(frames[selectedIndex + 1])} onClick={() => { const frame = frames[selectedIndex + 1]; if (frame) { void inspect(frame); } }}>{selectedIndex < 0 ? 'Inspect first indexed frame' : 'Next indexed frame'}</Button>
        <span className="small muted">{frames.length} frame(s) on this page{epoch ? ` / epoch ${shortId(epoch)}` : ''}</span>
      </div>
      {pending && <Notice live>Requesting a bounded frame extraction job…</Notice>}
      {jobPending && <Notice live>Frame job {job.data?.status ?? 'loading'} / {shortId(jobId)}. No image is substituted while pending.</Notice>}
      {error && <Notice tone="error" title="Frame request not confirmed" live>{error}</Notice>}
      {unconfirmed && <Notice tone="warning">Source-frame acknowledgement unknown. Unresolved source-frame requests remain disabled across selections; no retry is sent.</Notice>}
      {job.error && <Notice tone="error">Frame-job status is unavailable. {job.error} <Button onClick={job.refresh}>Recheck job</Button></Notice>}
      {job.data?.status === 'failed' && <Notice tone="error" title="Frame unavailable">{job.data.reason ?? 'The source decode or storage operation failed.'} No physical observation is asserted.</Notice>}
      <details className="stored-facts"><summary>Indexed frames and source PTS</summary>
        <div className="table-scroll frame-index-table"><table><thead><tr><th>Source / epoch</th><th>Original PTS</th><th>Index</th><th>Inspect</th></tr></thead><tbody>
          {frames.map(frame => <tr key={frameKey(frame)}><td><strong>{sourceSeconds(frame.source_us)}</strong><br /><code>{shortId(frame.epoch)}</code></td><td>{frame.raw_pts}<br /><span className="muted">time base {frame.time_base}</span></td><td>{frame.frame}<br /><code>{shortId(frame.segment)}</code></td>
            <td><Button disabled={busy || blocked(frame)} onClick={() => { void inspect(frame); }} aria-label={`Inspect source ${sourceSeconds(frame.source_us)}, epoch ${shortId(frame.epoch)}`}>Inspect</Button></td></tr>)}
        </tbody></table></div>
        {!frames.length && <Empty title="No matching indexed frames on this page">Missing or unverified source time is not replaced by estimated frames. Check unavailable spans or another page.</Empty>}
      </details>
      <div className="cluster"><Button disabled={pages.length <= 1} onClick={() => setPages(value => value.slice(0, -1))}>Previous index page</Button>
        <Button disabled={!timeline.data?.next} onClick={() => { const next = timeline.data?.next; if (next) setPages(value => [...value, next]); }}>Next index page</Button><span className="small muted">Page {pages.length} / at most 256 backend records per page</span></div>
      {timeline.data && <JsonFacts title="Source clock, unavailable spans and gaps" value={{ clock: timeline.data.clock, unavailable: timeline.data.frames.filter(frame => 'unavailable' in frame), gaps: timeline.data.gaps }} />}
    </div>
    {jobId && <div className="panel evidence">
      <div className="evidence-header"><div><strong>Source-indexed still / UNREDACTED</strong><p>Fixture or source evidence, never a synthesized storyboard frame.</p></div><span className="mono">Job {shortId(jobId)}</span></div>
      <div className="evidence-stage">{media && failedImage !== media ? <img key={`${media}:${imageRevision}`} src={mediaUrl(media)} alt="Unredacted source-indexed evidence frame" onError={() => setFailedImage(media)} />
        : <Empty title={failedImage ? 'Frame media unavailable' : 'No resolved frame'}>{failedImage ? 'The frame may be missing, expired or unreadable. No replacement scene is shown.' : 'Wait for a successful backend extraction; no physical scene is currently asserted.'}</Empty>}</div>
      <div className="evidence-footer"><Facts items={[
        ['Requested source', requested ? sourceSeconds(requested.source_us) : null],
        ['Resolved source', sourceSeconds(job.data?.source_us)], ['Epoch', requested ? <code>{requested.epoch}</code> : null],
      ]} /></div>
      {media && <div className="evidence-actions"><Button onClick={() => { setFailedImage(''); setImageRevision(value => value + 1); }}>Reload frame media</Button></div>}
    </div>}
    {media && <ArtifactFacts api={api} id={media} />}
  </section>;
}
