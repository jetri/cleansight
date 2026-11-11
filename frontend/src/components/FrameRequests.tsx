import { createContext, useCallback, useContext, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ApiError } from '../api/client';
import type { WorkbenchApi } from '../api/client';
import type { FrameJob, IndexedFrame } from '../api/types';

export const frameKey = (frame: IndexedFrame) => `${frame.segment}:${frame.source_us}`;
type RequestState = 'pending' | 'unknown';
const FrameRequestContext = createContext<{
  requests: ReadonlyMap<string, RequestState>;
  request: (frame: IndexedFrame) => Promise<FrameJob | null>;
} | null>(null);

export function FrameRequests({ api, children }: { api: WorkbenchApi; children: ReactNode }) {
  const guards = useRef(new Map<string, RequestState>());
  const [requests, setRequests] = useState<ReadonlyMap<string, RequestState>>(guards.current);
  const request = useCallback(async (frame: IndexedFrame) => {
    const key = frameKey(frame);
    if (guards.current.has(key)) return null;
    guards.current.set(key, 'pending');
    setRequests(new Map(guards.current));
    try {
      const job = await api.requestFrame(frame.segment, frame.source_us);
      guards.current.delete(key);
      return job;
    } catch (failure) {
      if (failure instanceof ApiError && failure.uncertainWrite) guards.current.set(key, 'unknown');
      else guards.current.delete(key);
      throw failure;
    } finally {
      setRequests(new Map(guards.current));
    }
  }, [api]);
  return <FrameRequestContext value={{ requests, request }}>{children}</FrameRequestContext>;
}

export function useFrameRequests() {
  const value = useContext(FrameRequestContext);
  if (!value) throw new Error('Frame requests require workspace ownership');
  return value;
}
