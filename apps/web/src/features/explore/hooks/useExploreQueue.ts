import { useCallback, useEffect, useRef, useState } from "react";
import type { QueuePhase, SongSnapshot, SwipeDirection } from "@moc/contracts";
import { fetchNext, fetchProfile, submitSwipe } from "../api.js";

type Status =
  | { kind: "loading" }
  | { kind: "ready" }
  | { kind: "empty" } // queue empty after refill failed or returned nothing
  | { kind: "error" };

export interface ExploreQueueState {
  items: SongSnapshot[];
  phase: QueuePhase | null;
  status: Status["kind"];
  swipe: (direction: SwipeDirection) => void;
  retry: () => void;
}

const REFILL_THRESHOLD = 5;

/**
 * Local in-memory queue mirror. Triggers a background refill when items
 * dip below 5; switches to "empty" when both queue and refill have nothing.
 * Swipes pop the top card and fire-and-forget POST /swipe.
 */
export function useExploreQueue(): ExploreQueueState {
  const [items, setItems] = useState<SongSnapshot[]>([]);
  const [phase, setPhase] = useState<QueuePhase | null>(null);
  const [status, setStatus] = useState<Status["kind"]>("loading");
  const refillingRef = useRef(false);
  // Stays in sync with items so swipe() can read the current top
  // without putting items in its dependency array (which would break
  // the stable callback identity that CardStack relies on).
  const itemsRef = useRef<SongSnapshot[]>(items);
  itemsRef.current = items;

  const refresh = useCallback(async () => {
    refillingRef.current = true;
    try {
      const next = await fetchNext(20);
      // Profile fetch is fire-and-forget — the queue's phase is the
      // source of truth for the pill copy, profile fetch failure is
      // not user-visible.
      void fetchProfile().catch(() => null);
      setItems((prev) => mergeUnique(prev, next.items));
      setPhase(next.phase);
      setStatus(next.items.length === 0 ? "empty" : "ready");
    } catch {
      setStatus((prev) => (prev === "ready" ? "ready" : "error"));
    } finally {
      refillingRef.current = false;
    }
  }, []);

  // Initial load.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Background refill when below threshold.
  useEffect(() => {
    if (refillingRef.current) return;
    if (items.length < REFILL_THRESHOLD && status === "ready") {
      void refresh();
    }
  }, [items.length, status, refresh]);

  const swipe = useCallback((direction: SwipeDirection) => {
    // Read the current top from the ref — must happen before setItems so
    // we capture the right card even if React batches the state update.
    const top = itemsRef.current[0];
    if (top === undefined) return;
    setItems((prev) => (prev.length === 0 ? prev : prev.slice(1)));
    // Fire-and-forget outside the updater: React StrictMode double-invokes
    // functional updaters but not plain statements, so this runs exactly once.
    void submitSwipe(top, direction).catch(() => {});
  }, []);

  const retry = useCallback(() => {
    setStatus("loading");
    void refresh();
  }, [refresh]);

  // When queue drains entirely after a swipe and we're not still refilling,
  // mark empty so the RefillingState can surface.
  useEffect(() => {
    if (items.length === 0 && status === "ready" && !refillingRef.current) {
      setStatus("empty");
      void refresh();
    }
  }, [items.length, status, refresh]);

  return {
    items,
    phase,
    status,
    swipe,
    retry,
  };
}

function mergeUnique(prev: SongSnapshot[], incoming: SongSnapshot[]): SongSnapshot[] {
  const seen = new Set(prev.map(keyOf));
  const additions = incoming.filter((snap) => !seen.has(keyOf(snap)));
  return [...prev, ...additions];
}

function keyOf(s: SongSnapshot): string {
  return `${s.title.trim().toLowerCase()}|${s.artist.trim().toLowerCase()}|${s.durationSec ?? "?"}`;
}
