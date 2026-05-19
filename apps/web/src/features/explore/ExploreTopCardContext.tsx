import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { QueuePhase, SongSnapshot, SwipeDirection } from "@moc/contracts";
import { fetchNext, fetchProfile, submitSwipe } from "./api.js";

export type ExploreQueueStatus = "loading" | "ready" | "empty" | "error";

/**
 * Provider-scoped caches for the Explore deck. Identity is stable for the
 * lifetime of the provider (one per App tree), which means the caches
 * survive ExplorePage unmount/remount — navigating to another tab and back
 * does NOT re-fire /play/resolve for snapshots already in the cache, and
 * UI-21's retry latch is not re-armed for snapshots that already burned
 * their single attempt. Tests get fresh caches automatically because each
 * test re-mounts the App tree. See UI-21, UI-22, UI-31, UI-40.
 */
export interface ExploreCaches {
  /** key → resolved stream URL (or null if unresolvable). */
  readonly resolve: Map<string, string | null>;
  /** keys for which a /play/resolve fetch is currently in-flight. */
  readonly inFlight: Set<string>;
  /** keys for which UI-21's once-per-snapshot retry latch is set. */
  readonly retried: Set<string>;
  /** `${currentKey}→${nextKey}` pairs for which UI-22's once-per-pair
   *  near-end refresh has already fired. */
  readonly handoffRefreshed: Set<string>;
}

interface ExploreContextValue {
  // Published by useTopCardPreview so MiniPlayerHost knows to hide (UI-16).
  topCard: SongSnapshot | null;
  setTopCard: (snapshot: SongSnapshot | null) => void;
  // Persisted queue — survives route unmounts so tab switches don't reset the deck.
  items: SongSnapshot[];
  phase: QueuePhase | null;
  status: ExploreQueueStatus;
  swipe: (direction: SwipeDirection) => void;
  retry: () => void;
  // Call on first ExplorePage mount to start fetching. No-op on subsequent mounts
  // unless the queue previously errored (e.g. 401 before the user was authenticated).
  activate: () => void;
  caches: ExploreCaches;
}

const NOOP_CACHES: ExploreCaches = {
  resolve: new Map(),
  inFlight: new Set(),
  retried: new Set(),
  handoffRefreshed: new Set(),
};

const NOOP: ExploreContextValue = {
  topCard: null,
  setTopCard: () => {},
  items: [],
  phase: null,
  status: "loading",
  swipe: () => {},
  retry: () => {},
  activate: () => {},
  caches: NOOP_CACHES,
};

const ExploreContext = createContext<ExploreContextValue>(NOOP);

const REFILL_THRESHOLD = 5;
// UI-23: poll cadence while NextResponse.buildingQueue is true.
const BUILDING_POLL_INTERVAL_MS = 5_000;

export function ExploreTopCardProvider({ children }: { children: ReactNode }): JSX.Element {
  const [topCard, setTopCard] = useState<SongSnapshot | null>(null);
  // Stable for the lifetime of the provider (see ExploreCaches docstring).
  const cachesRef = useRef<ExploreCaches>({
    resolve: new Map<string, string | null>(),
    inFlight: new Set<string>(),
    retried: new Set<string>(),
    handoffRefreshed: new Set<string>(),
  });

  const [items, setItems] = useState<SongSnapshot[]>([]);
  const [phase, setPhase] = useState<QueuePhase | null>(null);
  const [status, setStatus] = useState<ExploreQueueStatus>("loading");
  // UI-23: mirrors NextResponse.buildingQueue so the polling effect below
  // knows when to schedule a 5 s tick.
  const [buildingQueue, setBuildingQueue] = useState(false);

  const activatedRef = useRef(false);
  const refillingRef = useRef(false);
  // Refs that shadow state so callbacks can read current values without
  // closing over stale state or appearing in effect dep arrays.
  const itemsRef = useRef<SongSnapshot[]>(items);
  itemsRef.current = items;
  const statusRef = useRef<ExploreQueueStatus>(status);
  statusRef.current = status;

  const refresh = useCallback(async () => {
    refillingRef.current = true;
    try {
      const next = await fetchNext(20);
      void fetchProfile().catch(() => null);
      setItems((prev) => mergeUnique(prev, next.items));
      setPhase(next.phase);
      setBuildingQueue(next.buildingQueue);
      setStatus(next.items.length === 0 ? "empty" : "ready");
    } catch {
      // UI-28: a transient fetchNext failure (network blip, 5xx, schema
      // parse) does NOT clear `buildingQueue`. The polling effect stays
      // subscribed at its 5-s cadence; the next successful poll either
      // confirms the flag or transitions it correctly. Surfacing "error"
      // here only kicks in when the deck is empty — if we already have
      // cards, the user keeps swiping while we retry in the background.
      setStatus((prev) => (prev === "ready" ? "ready" : "error"));
    } finally {
      refillingRef.current = false;
    }
  }, []);

  // UI-23: while the server reports a rebuild is in flight, poll
  // /api/explore/next every 5 s until items arrive or buildingQueue
  // flips false. The poll is cheap because rebuildQueue is idempotent
  // server-side (API-21) — repeated calls share one underlying build.
  useEffect(() => {
    if (!buildingQueue) return undefined;
    const interval = setInterval(() => {
      if (refillingRef.current) return;
      void refresh();
    }, BUILDING_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [buildingQueue, refresh]);

  // Start the queue on first ExplorePage mount. Re-fetches if a previous
  // attempt failed (e.g. user was not yet authenticated on first visit).
  const activate = useCallback(() => {
    if (refillingRef.current) return;
    if (activatedRef.current && statusRef.current !== "error") return;
    activatedRef.current = true;
    void refresh();
  }, [refresh]);

  // Background refill when the deck drops below the threshold.
  useEffect(() => {
    if (!activatedRef.current || refillingRef.current) return;
    if (items.length < REFILL_THRESHOLD && status === "ready") {
      void refresh();
    }
  }, [items.length, status, refresh]);

  // When the queue drains entirely after a swipe, mark empty and try refilling.
  useEffect(() => {
    if (!activatedRef.current) return;
    if (items.length === 0 && status === "ready" && !refillingRef.current) {
      setStatus("empty");
      void refresh();
    }
  }, [items.length, status, refresh]);

  const swipe = useCallback((direction: SwipeDirection) => {
    const top = itemsRef.current[0];
    if (top === undefined) return;
    setItems((prev) => (prev.length === 0 ? prev : prev.slice(1)));
    void submitSwipe(top, direction).catch(() => {});
  }, []);

  const retry = useCallback(() => {
    setStatus("loading");
    void refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({
      topCard,
      setTopCard,
      items,
      phase,
      status,
      swipe,
      retry,
      activate,
      caches: cachesRef.current,
    }),
    [topCard, items, phase, status, swipe, retry, activate],
  );

  return <ExploreContext.Provider value={value}>{children}</ExploreContext.Provider>;
}

export function useExploreTopCard(): Pick<ExploreContextValue, "topCard" | "setTopCard"> {
  const { topCard, setTopCard } = useContext(ExploreContext);
  return { topCard, setTopCard };
}

export function useExploreContext(): ExploreContextValue {
  return useContext(ExploreContext);
}

// ---- Utilities ----

function mergeUnique(prev: SongSnapshot[], incoming: SongSnapshot[]): SongSnapshot[] {
  const seen = new Set(prev.map(keyOf));
  const additions = incoming.filter((snap) => !seen.has(keyOf(snap)));
  return [...prev, ...additions];
}

function keyOf(s: SongSnapshot): string {
  return `${s.title.trim().toLowerCase()}|${s.artist.trim().toLowerCase()}|${s.durationSec ?? "?"}`;
}
