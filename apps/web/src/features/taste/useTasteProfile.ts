import { useCallback, useEffect, useRef, useState } from "react";
import type { TasteBucketsResponse } from "@moc/contracts";
import { nextPollDelayMs } from "@moc/web-core";
import { fetchTasteProfile } from "./api.js";

type ProfileState =
  | { status: "loading" }
  | { status: "ready"; data: TasteBucketsResponse; lastFetchedAt: number }
  | { status: "error"; error: Error };

export interface UseTasteProfileResult {
  state: ProfileState;
  /**
   * Imperative re-fetch. Called after a successful POST to
   * /api/me/taste/custom-mix so the just-submitted building bucket
   * appears in the grid without waiting the full polling cadence.
   */
  refresh: () => void;
  /**
   * True once polling has stopped after the 2-minute window without any
   * bucket transitioning out of `state: "building"`. The UI uses this
   * to flip still-building buckets into the failed visual per UI-36.
   */
  pollingStopped: boolean;
}

/**
 * Loads `/api/me/taste/profile` and polls while at least one bucket is
 * in `state: "building"`. The cadence is owned by `nextPollDelayMs`
 * (LOGIC-38): 3 s baseline, 8 s after 30 s elapsed, stop at 2 min.
 *
 * `elapsedMs` is measured from the most-recent build start (max
 * `lastBuiltAt` among `state === "building"` buckets) so a fresh
 * custom-mix request mid-poll resets the cadence — the user just
 * triggered new work and deserves the 3-second window.
 *
 * Cleanup: the effect tears down its timer on unmount AND a mounted
 * ref guards setState from a fetch still in flight when the page
 * unmounts (UI-36).
 */
export function useTasteProfile(): UseTasteProfileResult {
  const [state, setState] = useState<ProfileState>({ status: "loading" });
  const [pollingStopped, setPollingStopped] = useState(false);
  const mountedRef = useRef(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshTokenRef = useRef(0);

  const fetchOnce = useCallback(async (): Promise<TasteBucketsResponse | null> => {
    try {
      const data = await fetchTasteProfile();
      if (!mountedRef.current) return null;
      setState({ status: "ready", data, lastFetchedAt: Date.now() });
      return data;
    } catch (e: unknown) {
      if (!mountedRef.current) return null;
      setState({ status: "error", error: e instanceof Error ? e : new Error(String(e)) });
      return null;
    }
  }, []);

  const refresh = useCallback(() => {
    // Bumping the token cancels any pending poll and re-runs the effect
    // from a fresh fetch — the same mechanism the initial mount uses.
    refreshTokenRef.current += 1;
    setPollingStopped(false);
    void fetchOnce();
  }, [fetchOnce]);

  useEffect(() => {
    mountedRef.current = true;

    let cancelled = false;

    const clearPoll = (): void => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const schedule = (data: TasteBucketsResponse): void => {
      if (cancelled || !mountedRef.current) return;
      const buildingStartsAt = data.buckets
        .filter((b) => b.state === "building")
        .map((b) => Date.parse(b.lastBuiltAt))
        .filter((n) => Number.isFinite(n));
      if (buildingStartsAt.length === 0) {
        // No buckets building → no polling needed (UI-36).
        clearPoll();
        return;
      }
      const newestStart = Math.max(...buildingStartsAt);
      const elapsedMs = Date.now() - newestStart;
      const delay = nextPollDelayMs({ elapsedMs });
      if (delay === null) {
        // 2 minutes elapsed without transition — UI takes over (UI-36).
        clearPoll();
        setPollingStopped(true);
        return;
      }
      clearPoll();
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        if (cancelled || !mountedRef.current) return;
        void fetchOnce().then((next) => {
          if (next !== null) schedule(next);
        });
      }, delay);
    };

    void fetchOnce().then((data) => {
      if (data !== null) schedule(data);
    });

    return () => {
      cancelled = true;
      mountedRef.current = false;
      clearPoll();
    };
    // refreshTokenRef.current is a ref; tracking it as a dep would not
    // re-trigger anyway, so the imperative refresh() bumps via fetchOnce()
    // directly. The effect reruns only on fetchOnce identity (stable
    // useCallback with empty deps) — i.e. once per mount.
  }, [fetchOnce]);

  return { state, refresh, pollingStopped };
}
