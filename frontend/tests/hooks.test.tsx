import { useCallback } from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../src/api/client';
import { useResource } from '../src/hooks';
import { deferred } from './fixtures';

afterEach(() => vi.useRealTimers());

describe('resource polling and stale-selection isolation', () => {
  it('ignores late event A even if its transport ignores cancellation after selecting B', async () => {
    const a = deferred<string>(), b = deferred<string>();
    const { result, rerender } = renderHook(({ id }) => {
      const load = useCallback(async (_signal: AbortSignal) => id === 'A' ? a.promise : b.promise, [id]);
      return useResource(`event:${id}`, load, { interval: 0 });
    }, { initialProps: { id: 'A' } });
    rerender({ id: 'B' });
    expect(result.current.data).toBeNull();
    await act(async () => { b.resolve('event-B'); await b.promise; });
    expect(result.current.data).toBe('event-B');
    await act(async () => { a.resolve('late-event-A'); await a.promise; });
    expect(result.current.data).toBe('event-B');
  });

  it('retains last-good data through refresh failure without calling it refreshed', async () => {
    const load = vi.fn<(signal: AbortSignal) => Promise<string>>().mockResolvedValueOnce('stored-evidence').mockRejectedValueOnce(new ApiError('database_unavailable', 'Database unavailable'));
    const { result } = renderHook(() => useResource('event:A', load, { interval: 0 }));
    await act(async () => { await Promise.resolve(); });
    const updatedAt = result.current.updatedAt;
    expect(result.current.data).toBe('stored-evidence');
    act(() => result.current.refresh());
    await act(async () => { await Promise.resolve(); });
    expect(result.current.data).toBe('stored-evidence');
    expect(result.current.error).toBe('Database unavailable');
    expect(result.current.updatedAt).toBe(updatedAt);
  });

  it('does not leak last-good data or errors into another event key', async () => {
    const pending = deferred<string>();
    const { result, rerender } = renderHook(({ id }) => {
      const load = useCallback(async () => id === 'A' ? 'A-only' : pending.promise, [id]);
      return useResource(id, load, { interval: 0 });
    }, { initialProps: { id: 'A' } });
    await act(async () => { await Promise.resolve(); });
    expect(result.current.data).toBe('A-only');
    rerender({ id: 'B' });
    expect(result.current).toMatchObject({ data: null, error: null, loading: true, updatedAt: null });
    await act(async () => { pending.resolve('B-only'); await pending.promise; });
    expect(result.current.data).toBe('B-only');
  });

  it('does not overlap background reads and cancels its owned timer on unmount', async () => {
    vi.useFakeTimers();
    const first = deferred<string>();
    const load = vi.fn<(signal: AbortSignal) => Promise<string>>().mockReturnValueOnce(first.promise).mockResolvedValue('second');
    const { result, unmount } = renderHook(() => useResource('health', load, { interval: 100 }));
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    expect(load).toHaveBeenCalledTimes(1);
    await act(async () => { first.resolve('first'); await first.promise; });
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    expect(load).toHaveBeenCalledTimes(2);
    expect(result.current.data).toBe('second');
    unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    expect(load).toHaveBeenCalledTimes(2);
  });
});
