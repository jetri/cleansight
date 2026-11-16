import { useCallback, useEffect, useState } from 'react';
import { errorMessage } from './api/client';

export interface Resource<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  updatedAt: number | null;
  refresh: () => void;
}

/** Keep last-good data during refresh failures, but never across resource keys.
 * Cancellation plus the closed-over live flag rejects stale responses even when
 * a transport ignores AbortSignal. Polls do not overlap or remount the view.
 */
export function useResource<T>(
  key: string,
  load: (signal: AbortSignal) => Promise<T>,
  options: { enabled?: boolean; interval?: number } = {},
): Resource<T> {
  const { enabled = true, interval = 5_000 } = options;
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{
    key: string; data: T | null; error: string | null; updatedAt: number | null;
  }>({ key: '', data: null, error: null, updatedAt: null });
  const refresh = useCallback(() => setRevision(value => value + 1), []);

  useEffect(() => {
    if (!enabled) return;
    let live = true;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController;
    async function run() {
      controller = new AbortController();
      try {
        const data = await load(controller.signal);
        if (live) setState({ key, data, error: null, updatedAt: Date.now() });
      } catch (error) {
        if (live && !controller.signal.aborted) {
          setState(previous => ({
            key,
            data: previous.key === key ? previous.data : null,
            error: errorMessage(error),
            updatedAt: previous.key === key ? previous.updatedAt : null,
          }));
        }
      } finally {
        if (live && interval > 0) timeout = setTimeout(() => { void run(); }, interval);
      }
    }
    void run();
    return () => {
      live = false;
      clearTimeout(timeout);
      controller?.abort();
    };
  }, [key, load, enabled, interval, revision]);

  if (!enabled) return { data: null, error: null, loading: false, updatedAt: null, refresh };
  const current = state.key === key;
  return {
    data: current ? state.data : null,
    error: current ? state.error : null,
    loading: !current,
    updatedAt: current ? state.updatedAt : null,
    refresh,
  };
}

export function usePreference<T extends string>(key: string, choices: readonly T[], fallback: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const saved = localStorage.getItem(key);
      return choices.find(choice => choice === saved) ?? fallback;
    } catch { return fallback; }
  });
  const update = useCallback((next: T) => {
    setValue(next);
    try { localStorage.setItem(key, next); } catch { /* Preference storage is optional, not a failed domain write. */ }
  }, [key]);
  return [value, update] as const;
}

export function useNow() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(interval);
  }, []);
  return now;
}
