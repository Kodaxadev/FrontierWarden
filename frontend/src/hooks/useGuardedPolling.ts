import { useCallback, useEffect, useRef } from 'react';

interface GuardedPollingOptions {
  intervalMs: number;
  enabled?: boolean;
  pauseWhenHidden?: boolean;
}

type PollTask = (isCurrent: () => boolean) => Promise<void>;

function canRunInDocument(pauseWhenHidden: boolean): boolean {
  if (!pauseWhenHidden || typeof document === 'undefined') return true;
  return document.visibilityState !== 'hidden';
}

export function useGuardedPolling(
  task: PollTask,
  {
    intervalMs,
    enabled = true,
    pauseWhenHidden = true,
  }: GuardedPollingOptions,
): () => Promise<void> {
  const activeRef = useRef(false);
  const generationRef = useRef(0);
  const inFlightRef = useRef<Promise<void> | null>(null);

  const run = useCallback(() => {
    if (!enabled || !canRunInDocument(pauseWhenHidden)) return Promise.resolve();
    if (inFlightRef.current) return inFlightRef.current;

    const generation = generationRef.current;
    const isCurrent = () => activeRef.current && generationRef.current === generation;
    const promise = task(isCurrent).finally(() => {
      if (inFlightRef.current === promise) {
        inFlightRef.current = null;
      }
    });
    inFlightRef.current = promise;
    return promise;
  }, [enabled, pauseWhenHidden, task]);

  useEffect(() => {
    activeRef.current = true;
    void run();

    const intervalId = window.setInterval(() => {
      void run();
    }, intervalMs);

    const onVisibilityChange = () => {
      if (canRunInDocument(pauseWhenHidden)) {
        void run();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      activeRef.current = false;
      generationRef.current += 1;
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [intervalMs, pauseWhenHidden, run]);

  return run;
}
