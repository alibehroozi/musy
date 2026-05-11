import { useEffect } from "react";
import type { QueuePhase, SongSnapshot, SwipeDirection } from "@moc/contracts";
import { useExploreContext } from "../ExploreTopCardContext.js";
import type { ExploreQueueStatus } from "../ExploreTopCardContext.js";

export interface ExploreQueueState {
  items: SongSnapshot[];
  phase: QueuePhase | null;
  status: ExploreQueueStatus;
  swipe: (direction: SwipeDirection) => void;
  retry: () => void;
}

/**
 * Thin hook that surfaces the persisted explore queue from
 * ExploreTopCardContext. Calling this hook activates the queue on first mount
 * so it starts fetching; on subsequent mounts (after tab switches) the
 * existing queue state is returned as-is — no refetch.
 */
export function useExploreQueue(): ExploreQueueState {
  const { items, phase, status, swipe, retry, activate } = useExploreContext();

  // Trigger the initial fetch exactly once (or retry after auth failure).
  // `activate` is stable and idempotent so this is safe on StrictMode double-invoke.
  useEffect(() => {
    activate();
  }, [activate]);

  return { items, phase, status, swipe, retry };
}
