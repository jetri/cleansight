import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { ApiError } from '../src/api/client';
import type { StoredEvent } from '../src/api/types';
import { shortId as shortIdForTest } from '../src/format';
import { deferred, eventFixture, mockApi } from './fixtures';

afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe('real React workspace with explicit injected test client, not backend E2E', () => {
  it('renders honest empty and unavailable states without a hard-coded event wall', async () => {
    const api = mockApi({ cameras: vi.fn(async () => []), sessions: vi.fn(async () => []), runs: vi.fn(async () => []), queue: vi.fn(async () => []) });
    render(<App api={api} />);
    expect(await screen.findByRole('heading', { name: 'No matching fixture events' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'No event selected' })).toBeInTheDocument();
    expect(screen.getByText('Production OFF')).toBeInTheDocument();
    expect(screen.queryByText('WOULD_ALERT')).not.toBeInTheDocument();
    expect(api.review).not.toHaveBeenCalled();
  });

  it('keeps per-event notes while selecting A, B, then A, and keeps machine outcome separate', async () => {
    const user = userEvent.setup();
    const a = eventFixture(6), b = eventFixture(16, 'REJECTED');
    const api = mockApi({ queue: vi.fn(async () => [structuredClone(a), structuredClone(b)]) });
    render(<App api={api} />);
    await user.type(await screen.findByRole('textbox', { name: 'Review notes' }), 'A: missing contact evidence');
    await user.click(screen.getByRole('button', { name: `Inspect event ${shortIdForTest(b.id)}, REJECTED, final` }));
    await user.type(await screen.findByRole('textbox', { name: 'Review notes' }), 'B: independent draft');
    await user.click(screen.getByRole('button', { name: `Inspect event ${shortIdForTest(a.id)}, UNCERTAIN, final` }));
    expect(await screen.findByRole('textbox', { name: 'Review notes' })).toHaveValue('A: missing contact evidence');
    expect(api.review).not.toHaveBeenCalled();
    const summary = screen.getByRole('region', { name: 'Selected event summary before evidence' });
    expect(within(summary).getByText('UNCERTAIN')).toBeInTheDocument();
    expect(within(summary).getByText('No stored review')).toBeInTheDocument();
  });

  it('preserves the video DOM instance, position, notes, focus and filters through background polls', async () => {
    vi.useFakeTimers();
    const api = mockApi();
    render(<App api={api} />);
    await act(async () => { await Promise.resolve(); });
    const notes = screen.getByRole('textbox', { name: 'Review notes' });
    // Use a DOM change under the virtual clock; user-event's own delay timers
    // must not be mixed into the poll scheduler being tested here.
    fireEvent.change(notes, { target: { value: 'Polling must not erase this.' } });
    const video = document.querySelector('video')!;
    expect(video).not.toBeNull();
    video.currentTime = 2.25;
    fireEvent.timeUpdate(video);
    notes.focus();
    await act(async () => { await vi.advanceTimersByTimeAsync(5_100); });
    expect(document.querySelector('video')).toBe(video);
    expect(video.currentTime).toBe(2.25);
    expect(notes).toHaveFocus();
    expect(notes).toHaveValue('Polling must not erase this.');
    expect(screen.getByRole('combobox', { name: 'Machine outcome filter' })).toHaveValue('');
    expect(api.event).toHaveBeenCalledTimes(2);
    expect(api.review).not.toHaveBeenCalled();
  });

  it('ignores a late A detail response after explicit selection of B', async () => {
    const user = userEvent.setup();
    const pendingA = deferred<StoredEvent>();
    const a = eventFixture(6), b = eventFixture(16, 'INCOMPLETE');
    const api = mockApi({ queue: vi.fn(async () => [a, b]), event: vi.fn(id => id === a.id ? pendingA.promise : Promise.resolve(b)) });
    render(<App api={api} />);
    await user.click(await screen.findByRole('button', { name: `Inspect event ${shortIdForTest(b.id)}, INCOMPLETE, final` }));
    await screen.findByRole('textbox', { name: 'Review notes' });
    await act(async () => { pendingA.resolve(a); await pendingA.promise; });
    expect(screen.getByRole('heading', { name: `Event ${shortIdForTest(b.id)}` })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: `Event ${shortIdForTest(a.id)}` })).not.toBeInTheDocument();
  });

  it('uses unavailable policy/object/gate facts instead of qualifying an unknown field or adopting a 10s default', async () => {
    render(<App api={mockApi()} />);
    await screen.findByRole('textbox', { name: 'Review notes' });
    expect(screen.getByText('Run-pinned deadline unavailable')).toBeInTheDocument();
    expect(screen.getByText('Early-removal interval unavailable')).toBeInTheDocument();
    expect(screen.getByText('Unavailable / no typed backend projection')).toBeInTheDocument();
    expect(screen.queryByText(/10-second|10s/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /activate production/i })).not.toBeInTheDocument();
  });

  it('retains loaded facts and drafts when background detail refresh fails', async () => {
    const user = userEvent.setup();
    const api = mockApi();
    render(<App api={api} />);
    const notes = await screen.findByRole('textbox', { name: 'Review notes' });
    await user.type(notes, 'Retain through database failure');
    vi.mocked(api.event).mockRejectedValue(new ApiError('database_unavailable', 'Local database unavailable'));
    await user.click(screen.getByRole('button', { name: 'Refresh evidence' }));
    expect(await screen.findByText('Event detail could not be refreshed')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Review notes' })).toBe(notes);
    expect(notes).toHaveValue('Retain through database failure');
    expect(screen.getByRole('heading', { name: 'Event 00000006' })).toBeInTheDocument();
  });
});
