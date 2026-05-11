import { useEffect, useRef } from "react";
import { snapshotsMatch } from "@moc/web-core";
import type { SongSnapshot } from "@moc/contracts";
import { usePlayer } from "../../player/usePlayer.js";
import { useExploreTopCard } from "../ExploreTopCardContext.js";

/**
 * Wires the top card's snapshot into the existing PlayerProvider's
 * `playPreview` and publishes it to ExploreTopCardContext so the
 * docked mini-player knows to hide (UI-16).
 */
export function useTopCardPreview(top: SongSnapshot | null): void {
  const { playPreview, engineState } = usePlayer();
  const { setTopCard } = useExploreTopCard();

  // Publish the top card to the cross-tree context.
  useEffect(() => {
    setTopCard(top);
    return () => setTopCard(null);
  }, [top, setTopCard]);

  // Ref that mirrors engineState.currentTrack?.snapshot without being a
  // dep of the preview effect. Updated every render so the effect always
  // reads the latest value without re-running due to audio timeupdate events.
  const currentSnapshotRef = useRef<SongSnapshot | null>(null);
  currentSnapshotRef.current = engineState.currentTrack?.snapshot ?? null;

  // Tracks the snapshot we most recently called playPreview for.
  // Prevents duplicate HTTP calls from React StrictMode's double-invoke
  // and from rapid re-renders between when playPreview is called and when
  // its setEngineState update is committed.
  const pendingPreviewRef = useRef<SongSnapshot | null>(null);

  useEffect(() => {
    if (top === null) {
      pendingPreviewRef.current = null;
      return;
    }
    // Engine already has this snapshot loaded or loading — no restart needed.
    if (snapshotsMatch(currentSnapshotRef.current, top)) {
      pendingPreviewRef.current = top;
      return;
    }
    // Already called playPreview for this snapshot this mount cycle.
    if (snapshotsMatch(pendingPreviewRef.current, top)) return;
    pendingPreviewRef.current = top;
    playPreview(top);
  }, [top, playPreview]);
}
