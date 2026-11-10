import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { ApiError } from '../src/api/client';
import type { ReviewInput, StoredEvent } from '../src/api/types';
import { deferred, eventFixture, mockApi, uuid } from './fixtures';

function acknowledged(input: ReviewInput, number = 53): StoredEvent {
  return { ...eventFixture(), reviews: [{ id: uuid(number), ...input, supersedes_id: input.supersedes ?? null, created_at: '2026-11-10T09:03:00Z' }] };
}

async function prepare(user: ReturnType<typeof userEvent.setup>, notes: string) {
  await user.click(await screen.findByRole('radio', { name: 'Agree with machine interpretation' }));
  await user.type(screen.getByRole('textbox', { name: 'Review notes' }), notes);
}

describe('append-only feedback UI with explicit injected test client', () => {
  it('does not acknowledge saved before the response and blocks simultaneous duplicate submission', async () => {
    const user = userEvent.setup();
    const pending = deferred<StoredEvent>();
    const api = mockApi({ review: vi.fn(() => pending.promise) });
    render(<App api={api} />);
    await prepare(user, 'Explicit test notes');
    await user.dblClick(screen.getByRole('button', { name: 'Save feedback' }));
    expect(api.review).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
    expect(screen.queryByText(/Feedback .*saved by the server/)).not.toBeInTheDocument();
    const input = vi.mocked(api.review).mock.calls[0]![1];
    await act(async () => { pending.resolve(acknowledged(input)); await pending.promise; });
    expect(await screen.findByText(/Feedback .*saved by the server/)).toBeInTheDocument();
    const summary = screen.getByRole('region', { name: 'Selected event summary before evidence' });
    expect(within(summary).getByText('UNCERTAIN')).toBeInTheDocument();
  });

  it('retains newer typing while an older submitted draft is acknowledged', async () => {
    const user = userEvent.setup();
    const pending = deferred<StoredEvent>();
    const api = mockApi({ review: vi.fn(() => pending.promise) });
    render(<App api={api} />);
    await prepare(user, 'submitted');
    await user.click(screen.getByRole('button', { name: 'Save feedback' }));
    const input = vi.mocked(api.review).mock.calls[0]![1];
    await user.type(screen.getByRole('textbox', { name: 'Review notes' }), ' plus newer edits');
    await act(async () => { pending.resolve(acknowledged(input)); await pending.promise; });
    expect(screen.getByRole('textbox', { name: 'Review notes' })).toHaveValue('submitted plus newer edits');
    expect(await screen.findByText(/Newer edits are still unsaved/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save feedback correction' })).toBeEnabled();
  });

  it('retains fields after a definite validation failure and offers only an explicit retry', async () => {
    const user = userEvent.setup();
    const api = mockApi({ review: vi.fn().mockRejectedValueOnce(new ApiError('invalid_request', 'Test validation failure')).mockImplementation(async (_id, input: ReviewInput) => acknowledged(input)) });
    render(<App api={api} />);
    await prepare(user, 'retained draft');
    await user.click(screen.getByRole('button', { name: 'Save feedback' }));
    expect(await screen.findByText('Test validation failure')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Review notes' })).toHaveValue('retained draft');
    expect(api.review).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Retry feedback save' }));
    expect(await screen.findByText(/Feedback .*saved by the server/)).toBeInTheDocument();
    expect(api.review).toHaveBeenCalledTimes(2);
  });

  it('reconciles a lost acknowledgement by exact stored content without another POST', async () => {
    const user = userEvent.setup();
    let stored = eventFixture();
    const api = mockApi({ event: vi.fn(async () => structuredClone(stored)), review: vi.fn(async (_id, input) => {
      stored = acknowledged(input);
      throw new ApiError('connection_unavailable', 'Injected lost acknowledgement', true);
    }) });
    render(<App api={api} />);
    await prepare(user, 'stored before response loss');
    await user.click(screen.getByRole('button', { name: 'Save feedback' }));
    expect(await screen.findByText(/Matching stored feedback was found by a read/)).toBeInTheDocument();
    expect(api.review).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('textbox', { name: 'Review notes' })).toHaveValue('stored before response loss');
    expect(screen.getByRole('button', { name: 'Save feedback correction' })).toBeDisabled();
  });

  it('never blindly retries an unresolved write and retains subsequent notes', async () => {
    const user = userEvent.setup();
    const api = mockApi({ review: vi.fn(async () => { throw new ApiError('connection_unavailable', 'Injected unknown commit state', true); }) });
    render(<App api={api} />);
    await prepare(user, 'retain unknown request');
    await user.click(screen.getByRole('button', { name: 'Save feedback' }));
    expect(await screen.findByText('Write acknowledgement unknown')).toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: 'Review notes' }), ' and this new note');
    expect(screen.getByRole('button', { name: 'Save feedback' })).toBeDisabled();
    expect(screen.getByRole('textbox', { name: 'Review notes' })).toHaveValue('retain unknown request and this new note');
    expect(api.review).toHaveBeenCalledTimes(1);
  });

  it('rejects a successful-looking response that lacks the submitted stored feedback', async () => {
    const user = userEvent.setup();
    const api = mockApi({ review: vi.fn(async () => eventFixture()) });
    render(<App api={api} />);
    await prepare(user, 'must identify persisted record');
    await user.click(screen.getByRole('button', { name: 'Save feedback' }));
    expect(await screen.findByText('Write acknowledgement unknown')).toBeInTheDocument();
    expect(screen.queryByText(/saved by the server/)).not.toBeInTheDocument();
    expect(api.review).toHaveBeenCalledTimes(1);
  });

  it('keeps original machine transitions after reviewer disagreement', async () => {
    const user = userEvent.setup();
    const api = mockApi();
    render(<App api={api} />);
    await user.click(await screen.findByRole('radio', { name: 'Disagree with machine interpretation' }));
    await user.type(screen.getByRole('textbox', { name: 'Review notes' }), 'human disagreement, not a machine rewrite');
    await user.click(screen.getByRole('button', { name: 'Save feedback' }));
    await waitFor(() => expect(api.review).toHaveBeenCalledTimes(1));
    expect(vi.mocked(api.review).mock.calls[0]?.[1]).toMatchObject({ state: 'rejected', reason: 'disagree_with_machine' });
    expect(within(screen.getByRole('region', { name: 'Selected event summary before evidence' })).getByText('UNCERTAIN')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Full chronological state transition history' })).getByRole('heading', { name: 'UNCERTAIN' })).toBeInTheDocument();
  });
});
