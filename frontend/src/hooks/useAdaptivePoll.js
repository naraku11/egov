/**
 * useAdaptivePoll — smart polling hook with Page Visibility API + adaptive backoff.
 *
 * Behaviour:
 *  - Pauses when the browser tab is hidden (Page Visibility API) and resumes
 *    immediately (at `minInterval`) when the tab becomes visible again.
 *  - Compares each response to the previous one; if nothing has changed the
 *    interval is multiplied by `BACKOFF_FACTOR` up to `maxInterval`, reducing
 *    unnecessary server load during quiet periods.
 *  - Resets to `minInterval` the moment any change is detected so the UI stays
 *    responsive after activity.
 *  - Returns a cleanup function in the useEffect so there are zero memory leaks
 *    (timer, visibility listener, and the mounted flag are all cleared).
 *
 * @param {() => Promise<any>} fn  - Async function to call on each poll cycle.
 *   Its return value is JSON-serialised and compared to detect changes.
 *   Pass a fire-and-forget function (returns undefined/void) to disable
 *   adaptive backoff — the interval stays fixed at `minInterval`.
 *
 * @param {object}  [options]
 * @param {number}  [options.minInterval=60_000]   - Fastest polling rate (ms).
 * @param {number}  [options.maxInterval=300_000]  - Slowest polling rate (ms).
 * @param {boolean} [options.enabled=true]         - Set false to pause entirely.
 */

import { useEffect, useRef, useCallback } from 'react';

const BACKOFF_FACTOR = 1.5;

export function useAdaptivePoll(fn, {
  minInterval = 60_000,
  maxInterval = 5 * 60_000,
  enabled = true,
} = {}) {
  const timerRef    = useRef(null);
  const intervalRef = useRef(minInterval);
  const prevHashRef = useRef(undefined); // undefined = first run, skip comparison
  const mountedRef  = useRef(true);

  const clear = () => clearTimeout(timerRef.current);

  const tick = useCallback(async () => {
    if (!mountedRef.current || document.hidden || !enabled) return;

    try {
      const result = await fn();
      const hash   = JSON.stringify(result ?? null);

      if (prevHashRef.current === undefined) {
        // First result — just store, don't adjust interval
        prevHashRef.current = hash;
      } else if (hash !== prevHashRef.current) {
        // Data changed → reset to fast interval
        intervalRef.current = minInterval;
        prevHashRef.current = hash;
      } else {
        // No change → slow down
        intervalRef.current = Math.min(
          Math.round(intervalRef.current * BACKOFF_FACTOR),
          maxInterval,
        );
      }
    } catch {
      // On error, back off to avoid hammering a failing endpoint
      intervalRef.current = Math.min(
        Math.round(intervalRef.current * BACKOFF_FACTOR),
        maxInterval,
      );
    }

    if (mountedRef.current) {
      timerRef.current = setTimeout(tick, intervalRef.current);
    }
  }, [fn, minInterval, maxInterval, enabled]);

  useEffect(() => {
    mountedRef.current = true;
    intervalRef.current = minInterval;
    prevHashRef.current = undefined;

    const onVisibility = () => {
      if (document.hidden) {
        // Tab hidden — pause
        clear();
      } else {
        // Tab visible — reset to fast interval and restart immediately
        intervalRef.current = minInterval;
        tick();
      }
    };

    document.addEventListener('visibilitychange', onVisibility);

    // Kick off the first poll right away (only if tab is visible)
    if (!document.hidden && enabled) {
      timerRef.current = setTimeout(tick, minInterval);
    }

    return () => {
      mountedRef.current = false;
      clear();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [tick, minInterval, enabled]);
}
