import { useEffect, useRef } from "react";
import { snapshotsMatch } from "@moc/web-core";
import type { SongSnapshot } from "@moc/contracts";
import { usePlayer } from "../../player/usePlayer.js";
import { useExploreTopCard } from "../ExploreTopCardContext.js";
import { resolveStream } from "../../player/api.js";

const PRE_RESOLVE_AHEAD = 5;

/**
 * Wires the top card's snapshot into the existing PlayerProvider's
 * `playPreview`/`loadPreview` and publishes it to ExploreTopCardContext
 * so the docked mini-player knows to hide (UI-16).
 *
 * Also pre-resolves the next PRE_RESOLVE_AHEAD cards so their stream
 * URLs are ready when they become the top card, enabling the volume-dip
 * crossfade to start immediately without a blocking /play/resolve round-trip.
 */
export function useTopCardPreview(items: SongSnapshot[]): void {
  const top = items[0] ?? null;
  const { playPreview, loadPreview, engineState } = usePlayer();
  const { setTopCard } = useExploreTopCard();

  // Publish the top card to the cross-tree context.
  useEffect(() => {
    setTopCard(top);
    return () => setTopCard(null);
  }, [top, setTopCard]);

  // keyed by snapshotKey → resolved streamUrl (null = unresolvable)
  const resolveCache = useRef<Map<string, string | null>>(new Map());
  // tracks in-flight resolves so we don't fire duplicates
  const resolvingKeys = useRef<Set<string>>(new Set());

  // Pre-resolve cards [1..PRE_RESOLVE_AHEAD] ahead of the top card.
  useEffect(() => {
    const ahead = items.slice(1, 1 + PRE_RESOLVE_AHEAD);
    for (const snap of ahead) {
      const k = snapshotKey(snap);
      if (resolveCache.current.has(k) || resolvingKeys.current.has(k)) continue;
      resolvingKeys.current.add(k);
      resolveStream({ snapshot: snap })
        .then((res) => {
          resolveCache.current.set(k, res.streamUrl);
        })
        .catch(() => {
          // Leave absent — playPreview will retry via /play/resolve if needed.
        })
        .finally(() => {
          resolvingKeys.current.delete(k);
        });
    }
  // items identity changes on every swipe; run the effect each time.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  // Ref that mirrors engineState.currentTrack?.snapshot without being a
  // dep of the preview effect. Updated every render so the effect always
  // reads the latest value without re-running due to audio timeupdate events.
  const currentSnapshotRef = useRef<SongSnapshot | null>(null);
  currentSnapshotRef.current = engineState.currentTrack?.snapshot ?? null;

  // Tracks the snapshot we most recently called playPreview/loadPreview for.
  // Prevents duplicate HTTP calls from React StrictMode's double-invoke
  // and from rapid re-renders between when the call is made and when
  // the setEngineState update is committed.
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
    // Already called play/loadPreview for this snapshot this mount cycle.
    if (snapshotsMatch(pendingPreviewRef.current, top)) return;
    pendingPreviewRef.current = top;

    const cached = resolveCache.current.get(snapshotKey(top));
    if (cached !== undefined && cached !== null) {
      // Pre-resolved URL is ready — skip the /play/resolve round-trip and
      // go straight to the crossfade + load.
      loadPreview(top, cached);
    } else {
      playPreview(top);
    }
  }, [top, playPreview, loadPreview]);
}

function snapshotKey(s: SongSnapshot): string {
  return `${s.title.trim().toLowerCase()}|${s.artist.trim().toLowerCase()}|${s.durationSec ?? "?"}`;
}
