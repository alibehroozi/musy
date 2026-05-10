import { useEffect } from "react";
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

  // Auto-play preview when the top card changes (only if it isn't already
  // the loaded track — avoids reloading on remount).
  const currentSnapshot = engineState.currentTrack?.snapshot ?? null;
  useEffect(() => {
    if (top === null) return;
    if (snapshotsMatch(currentSnapshot, top)) return;
    playPreview(top);
  }, [top, currentSnapshot, playPreview]);
}
