import { useCallback, useEffect, useRef } from "react";
import { snapshotsMatch } from "@moc/web-core";
import type { SongSnapshot, SwipeDirection } from "@moc/contracts";
import { usePlayer } from "../player/usePlayer.js";
import { useExploreContext } from "./ExploreTopCardContext.js";

/**
 * UI-40: Top-level bridge that registers OS Media Session
 * `nexttrack` / `previoustrack` handlers for the Explore queue. Mounted
 * inside both `PlayerProvider` and `ExploreTopCardProvider`, so it lives
 * for the entire app session — registering / unregistering based on
 * whether the audio engine is currently playing the top item of the
 * Explore queue, NOT on whether `/explore` is the visible route. This
 * closes a PWA bug where leaving `/explore` (e.g. to `/taste`) while a
 * song was playing unregistered the like/pass handlers, leaving the
 * lock-screen next/prev buttons silently no-op.
 *
 * The bridge does NOT render any DOM.
 */
export function ExploreMediaBridge(): null {
  const { items, swipe, caches } = useExploreContext();
  const { engineState, loadPreview, registerMediaOverrides } = usePlayer();

  // Live ref so the registered handlers read items[1] without having to
  // re-register on every queue change.
  const itemsRef = useRef(items);
  itemsRef.current = items;
  // Same idea for the resolve cache lookup inside the handler.
  const cachesRef = useRef(caches);
  cachesRef.current = caches;

  const advance = useCallback(
    (direction: SwipeDirection) => {
      const list = itemsRef.current;
      const nextSnap = list[1];
      if (nextSnap !== undefined) {
        const cached = cachesRef.current.resolve.get(snapshotKey(nextSnap)) ?? null;
        if (cached !== null) {
          // UI-29 + UI-31: loadPreview is now synchronous (no RAF, no fade),
          // so engine.load — and therefore audio.play() — happens within the
          // same microtask as the OS handler invocation. iOS Safari only
          // honors `audio.play()` inside the synchronous portion of a
          // gesture; any async hop loses the gesture context.
          loadPreview(nextSnap, cached);
        }
      }
      // Queue advancement is async (setState → render → effect) and lives
      // outside the gesture window; that's OK — the audio is already
      // playing the new track by this point.
      swipe(direction);
    },
    [loadPreview, swipe],
  );

  const onNext = useCallback(() => advance("right"), [advance]);
  const onPrev = useCallback(() => advance("left"), [advance]);

  // Only register while the engine's currentTrack is the top of the
  // Explore queue. If the user starts a Bucket-detail playback the
  // engine's currentTrack is no longer items[0], so the bridge
  // unregisters and OS controls fall back to PlayerProvider defaults.
  const currentTrack = engineState.currentTrack?.snapshot ?? null;
  const top = items[0] ?? null;
  const isExploreActive =
    top !== null && currentTrack !== null && snapshotsMatch(currentTrack, top);

  useEffect(() => {
    if (!isExploreActive) return undefined;
    return registerMediaOverrides({ onNext, onPrev });
  }, [isExploreActive, registerMediaOverrides, onNext, onPrev]);

  return null;
}

function snapshotKey(s: SongSnapshot): string {
  return `${s.title.trim().toLowerCase()}|${s.artist.trim().toLowerCase()}|${s.durationSec ?? "?"}`;
}
