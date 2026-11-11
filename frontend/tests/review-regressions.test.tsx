import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { ApiError } from '../src/api/client';
import type { FrameJob, Session } from '../src/api/types';
import { SourcePreview } from '../src/components/Sources';
import { shortId } from '../src/format';
import { frame, run, session, uuid } from './data';
import { deferred, eventFixture, mockApi } from './fixtures';

const lost = () => new ApiError('connection_unavailable', 'Injected lost acknowledgement', true);
const pane = (name: string) => within(screen.getByRole('tabpanel', { name }));
const resourceSelect = (name: string, value: string) => fireEvent.change(screen.getByRole('combobox', { name }), { target: { value } });
const inspector = (panel: HTMLElement) => within(panel.querySelector<HTMLElement>('[aria-label="Source-indexed frame inspection"]')!);

afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe('review regressions through executable workspace behavior', () => {
  it('expires the preview caption, overlay and health label while the next refresh hangs', async () => {
    vi.useFakeTimers();
    const live: Session = { ...structuredClone(session), stopped_at: null, health: { transport: 'connected', preview: {
      artifact: uuid(77), epoch: frame.epoch, source_us: 0, source_age_seconds: 1, stale: false,
      source_observed_at: new Date().toISOString(), age_basis: 'sealed_recording_host_mtime_not_camera_utc',
    } } };
    const stalled = deferred<Session[]>();
    const api = mockApi({ sessions: vi.fn().mockResolvedValueOnce([live]).mockReturnValue(stalled.promise) });
    render(<App api={api} />);
    await act(async () => { await Promise.resolve(); });
    fireEvent.click(screen.getByRole('tab', { name: 'Sources & zones' }));
    const sources = pane('Sources & zones');
    expect(sources.getByText('Near-live sealed-source still')).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(7_000); });
    expect(sources.queryByText('STALE STILL / NOT LIVE')).not.toBeInTheDocument();
    expect(api.sessions).toHaveBeenCalledTimes(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    expect(sources.getByText('STALE STILL / NOT LIVE')).toBeInTheDocument();
    expect(sources.getByText('Stale preview')).toBeInTheDocument();
    expect(sources.getByText('Stale still', { exact: true })).toBeInTheDocument();
    await act(async () => { stalled.resolve([live]); await stalled.promise; });
    expect(sources.getByText('Near-live sealed-source still')).toBeInTheDocument();
    expect(sources.getByText('Sealed-source still', { exact: true })).toBeInTheDocument();
  });

  it.each(['disconnected', 'stopped', 'transport', 'server'] as const)('does not label a %s source near-live', reason => {
    const live: Session = { ...structuredClone(session), stopped_at: reason === 'stopped' ? session.started_at : null, health: {
      transport: reason === 'transport' ? 'unknown' : 'connected', preview: {
        artifact: uuid(77), epoch: frame.epoch, source_us: 0, source_age_seconds: 1, stale: reason === 'server',
        source_observed_at: session.started_at, age_basis: 'sealed_recording_host_mtime_not_camera_utc',
      },
    } };
    render(<SourcePreview session={live} updatedAt={Date.now()} disconnected={reason === 'disconnected'} />);
    expect(screen.getByText('STALE STILL / NOT LIVE')).toBeInTheDocument();
    expect(screen.queryByText('Near-live sealed-source still')).not.toBeInTheDocument();
  });

  it('retains every unknown replay across mode and session switches without retrying', async () => {
    const user = userEvent.setup();
    const api = mockApi({ sessions: vi.fn(async () => [session, { ...session, id: uuid(33) }]), replay: vi.fn(async () => { throw lost(); }) });
    render(<App api={api} />);
    await user.click(screen.getByRole('tab', { name: 'Capture & replay' }));
    await user.click(await screen.findByRole('button', { name: 'Create replay run' }));
    resourceSelect('Captured source session', session.id);
    await user.click(screen.getByRole('button', { name: 'Create new run' }));
    expect(await screen.findByText('Run acknowledgement unknown / no retry sent')).toBeInTheDocument();
    resourceSelect('Run mode', 'observation_fixture');
    await user.click(screen.getByRole('button', { name: 'Create new run' }));
    await waitFor(() => expect(api.replay).toHaveBeenCalledTimes(2));
    resourceSelect('Captured source session', uuid(33));
    resourceSelect('Run mode', 'media_replay');
    await user.click(screen.getByRole('button', { name: 'Create new run' }));
    await waitFor(() => expect(api.replay).toHaveBeenCalledTimes(3));
    for (const [identity, mode] of [[session.id, 'media_replay'], [session.id, 'observation_fixture'], [uuid(33), 'media_replay']]) {
      resourceSelect('Captured source session', identity!);
      resourceSelect('Run mode', mode!);
      const create = screen.getByRole('button', { name: 'Create new run' });
      expect(create).toBeDisabled();
      fireEvent.click(create);
    }
    expect(api.replay).toHaveBeenCalledTimes(3);
    await user.click(screen.getByRole('button', { name: 'Close / retain selection' }));
    await user.click(screen.getByRole('tab', { name: 'Evidence desk' }));
    await user.click(screen.getByRole('tab', { name: 'Capture & replay' }));
    await user.click(screen.getByRole('button', { name: 'Create replay run' }));
    expect(screen.getByRole('button', { name: 'Create new run' })).toBeDisabled();
  });

  it('retains frame guards across other requests, both navigation directions, runs and event remounts', async () => {
    const user = userEvent.setup();
    const a = eventFixture(6), b = eventFixture(16, 'REJECTED');
    const api = mockApi({ requestFrame: vi.fn(async () => { throw lost(); }), queue: vi.fn(async () => [a, b]), event: vi.fn(async id => id === a.id ? a : b) });
    render(<App api={api} />);
    await user.click(screen.getByRole('tab', { name: 'Capture & replay' }));
    resourceSelect('Selected run', run.id);
    const replay = screen.getByRole('tabpanel', { name: 'Capture & replay' });
    let frames = inspector(replay);
    await waitFor(() => expect(frames.getByRole('button', { name: 'Inspect first indexed frame' })).toBeEnabled());
    await user.click(frames.getByRole('button', { name: 'Inspect first indexed frame' }));
    await frames.findByText(/Source-frame acknowledgement unknown/);
    await user.click(frames.getByRole('button', { name: 'Next indexed frame' }));
    await waitFor(() => expect(api.requestFrame).toHaveBeenCalledTimes(2));
    expect(frames.getByRole('button', { name: 'Previous indexed frame' })).toBeDisabled();
    expect(frames.getAllByRole('button', { name: /^Inspect source/, hidden: true })).toHaveLength(2);
    for (const button of frames.getAllByRole('button', { name: /^Inspect source/, hidden: true })) expect(button).toBeDisabled();
    resourceSelect('Selected run', '');
    resourceSelect('Selected run', run.id);
    frames = inspector(replay);
    await waitFor(() => expect(frames.getAllByRole('button', { name: /^Inspect source/, hidden: true })).toHaveLength(2));
    expect(frames.getByRole('button', { name: 'Inspect first indexed frame' })).toBeDisabled();
    await user.click(screen.getByRole('tab', { name: 'Evidence desk' }));
    const evidence = screen.getByRole('tabpanel', { name: 'Evidence desk' });
    for (const event of [b, a]) {
      await user.click(within(evidence).getByRole('button', { name: `Inspect event ${shortId(event.id)}, ${event.machine_outcome}, final` }));
      await within(evidence).findByRole('heading', { name: `Event ${shortId(event.id)}` });
      const eventFrames = inspector(evidence);
      await waitFor(() => expect(eventFrames.getAllByRole('button', { name: /^Inspect source/, hidden: true })).toHaveLength(2));
      expect(eventFrames.getByRole('button', { name: 'Inspect first indexed frame', hidden: true })).toBeDisabled();
    }
    expect(api.requestFrame).toHaveBeenCalledTimes(2);
  });

  it('guards an in-flight frame across remounts and releases acknowledged and definite failures', async () => {
    const user = userEvent.setup();
    const pending = deferred<FrameJob>();
    const api = mockApi({ requestFrame: vi.fn().mockReturnValueOnce(pending.promise).mockRejectedValueOnce(new ApiError('invalid_request', 'Definite rejection')).mockResolvedValue({ id: uuid(55), status: 'queued' }) });
    render(<App api={api} />);
    await user.click(screen.getByRole('tab', { name: 'Capture & replay' }));
    resourceSelect('Selected run', run.id);
    const replay = screen.getByRole('tabpanel', { name: 'Capture & replay' });
    await waitFor(() => expect(inspector(replay).getByRole('button', { name: 'Inspect first indexed frame' })).toBeEnabled());
    await user.click(inspector(replay).getByRole('button', { name: 'Inspect first indexed frame' }));
    resourceSelect('Selected run', '');
    resourceSelect('Selected run', run.id);
    let frames = inspector(replay);
    await waitFor(() => expect(frames.getAllByRole('button', { name: /^Inspect source/, hidden: true })).toHaveLength(2));
    expect(frames.getByRole('button', { name: 'Inspect first indexed frame' })).toBeDisabled();
    await act(async () => { pending.resolve({ id: uuid(55), status: 'queued' }); await pending.promise; });
    await user.click(frames.getByRole('button', { name: 'Inspect first indexed frame' }));
    await frames.findByText('Definite rejection');
    expect(api.requestFrame).toHaveBeenCalledTimes(2);
    resourceSelect('Selected run', '');
    resourceSelect('Selected run', run.id);
    frames = inspector(replay);
    await waitFor(() => expect(frames.getByRole('button', { name: 'Inspect first indexed frame' })).toBeEnabled());
    await user.click(frames.getByRole('button', { name: 'Inspect first indexed frame' }));
    expect(await frames.findByAltText('Unredacted source-indexed evidence frame')).toBeInTheDocument();
    expect(api.requestFrame).toHaveBeenLastCalledWith(frame.segment, frame.source_us);
    expect(api.requestFrame).toHaveBeenCalledTimes(3);
  });
});
