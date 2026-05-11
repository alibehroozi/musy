import { useEffect, useRef, useState } from "react";
import { snapshotsMatch, playableHandoffDecision } from "@moc/web-core";
import type { SongSnapshot } from "@moc/contracts";
import { usePlayer } from "../../player/usePlayer.js";
import { useExploreTopCard } from "../ExploreTopCardContext.js";
import { resolveStream } from "../../player/api.js";

const PRE_RESOLVE_AHEAD = 5;
const HANDOFF_LOOKAHEAD_MS = 5_000;

export interface UseTopCardPreviewResult {
  /**
   * `true` while a UI-21 retry's `POST /api/play/resolve` is in flight for
   * the current top card. Consumers (e.g. ExplorePage's auto-skip
   * useEffect) should treat `engineState.status === "failed" && isRecovering`
   * as "still recovering, do not advance the deck" — UI-24.
   */
  isRecovering: boolean;
}

/**
 * Wires the top card's snapshot into the existing PlayerProvider's
 * `playPreview`/`loadPreview` and publishes it to ExploreTopCardContext
 * so the docked mini-player knows to hide (UI-16).
 *
 * Also pre-resolves the next PRE_RESOLVE_AHEAD cards so their stream
 * URLs are ready when they become the top card, enabling the volume-dip
 * crossfade to start immediately without a blocking /play/resolve round-trip.
 *
 * UI-21: when a cached pre-resolved URL has gone stale (e.g. SoundCloud's
 * 55-min signed-URL TTL elapsed while the card sat in the deck) and the
 * browser 403s, retry exactly once by re-resolving via /play/resolve —
 * the backend regenerates a fresh signed URL on every call.
 *
 * UI-25: the retry's `loadPreview` is gated on the snapshot still being
 * the top card at the moment the retry resolves. A user-driven swipe (or
 * any code path that advances the queue) during the retry window means
 * the now-current top would otherwise be overwritten by the stale
 * snapshot's audio — UI-25 silences that race.
 *
 * UI-26: when the deck drains to zero items, the audio is paused but the
 * engine's `currentTrack` (and therefore the navigator.mediaSession
 * metadata) is preserved so the OS-level binding survives the
 * buildingQueue window.
 */
export function useTopCardPreview(items: SongSnapshot[]): UseTopCardPreviewResult {
  const top = items[0] ?? null;
  const next = items[1] ?? null;
  const { playPreview, loadPreview, pause, engineState } = usePlayer();
  const { setTopCard } = useExploreTopCard();

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
  }, [items]);

  const currentSnapshotRef = useRef<SongSnapshot | null>(null);
  currentSnapshotRef.current = engineState.currentTrack?.snapshot ?? null;

  // Ref-shadow of `top` so the UI-21 retry callback (an async promise
  // resolved long after the effect fires) can re-check the live top card
  // and bail out if the user has already swiped past the failed snapshot
  // (UI-25). Without this, a delayed retry can call loadPreview on a
  // stale snapshot and "barge in" over the now-current top.
  const topRef = useRef<SongSnapshot | null>(top);
  topRef.current = top;

  const pendingPreviewRef = useRef<SongSnapshot | null>(null);

  // UI-21 latches:
  //   loadedViaCacheRef — snapshot that was loaded via the cached-URL fast
  //     path; armed for retry if the engine later errors before reaching
  //     "playing". Cleared once the snapshot reaches "playing" (no more
  //     late retries) or once a retry has been issued.
  //   retriedKeysRef — snapshot keys we've already retried this mount, so
  //     a second error doesn't loop us.
  const loadedViaCacheRef = useRef<SongSnapshot | null>(null);
  const retriedKeysRef = useRef<Set<string>>(new Set());

  // UI-24: `isRecovering` is true between the UI-21 retry's
  // `resolveStream()` call and its settle. ExplorePage gates its 5-s
  // auto-skip-on-failure timer on `!isRecovering` so a still-recoverable
  // card is not swiped out from under the user.
  const [isRecovering, setIsRecovering] = useState(false);

  useEffect(() => {
    if (top === null) {
      pendingPreviewRef.current = null;
      // UI-26: silence the just-swiped track when the deck drains while
      // the queue rebuilds. The engine's currentTrack + mediaSession
      // metadata are deliberately preserved so the OS lock-screen
      // binding survives the rebuild window — only the audio is paused.
      pause();
      return;
    }
    if (snapshotsMatch(currentSnapshotRef.current, top)) {
      pendingPreviewRef.current = top;
      return;
    }
    if (snapshotsMatch(pendingPreviewRef.current, top)) return;
    pendingPreviewRef.current = top;

    const cached = resolveCache.current.get(snapshotKey(top));
    if (cached !== undefined && cached !== null) {
      loadedViaCacheRef.current = top;
      loadPreview(top, cached);
    } else {
      loadedViaCacheRef.current = null;
      playPreview(top);
    }
  }, [top, playPreview, loadPreview, pause]);

  // UI-21 + UI-24 + UI-25: on engine error against a cached-load snapshot,
  // drop the stale cache entry and re-resolve once. While the retry is
  // in flight, `isRecovering === true` so the deck does not auto-advance
  // (UI-24). When the retry resolves, gate the `loadPreview` call on the
  // snapshot still being the top card (UI-25) — a delayed retry must not
  // play a swiped-past track over the now-current top. The terminal
  // `failed` state is reached only when the retry's /play/resolve returns
  // null or the second load also errors (the retry path doesn't re-arm
  // itself).
  useEffect(() => {
    if (engineState.status !== "failed") return;
    const current = engineState.currentTrack?.snapshot;
    if (!current) return;
    if (!snapshotsMatch(loadedViaCacheRef.current, current)) return;
    const key = snapshotKey(current);
    if (retriedKeysRef.current.has(key)) return;
    retriedKeysRef.current.add(key);
    resolveCache.current.delete(key);
    loadedViaCacheRef.current = null;

    setIsRecovering(true);
    void resolveStream({ snapshot: current })
      .then((res) => {
        // UI-25: the user (or any other code path) may have swiped past
        // `current` while the retry was in flight. Loading the fresh URL
        // now would replace whatever is playing on the new top card with
        // the stale snapshot's audio. Silently discard.
        if (!snapshotsMatch(topRef.current, current)) return;
        if (res.streamUrl === null) return;
        resolveCache.current.set(key, res.streamUrl);
        loadPreview(current, res.streamUrl);
      })
      .catch(() => {
        // Silent — engine stays in failed state, UI-12 / auto-skip take over.
      })
      .finally(() => {
        setIsRecovering(false);
      });
  }, [engineState.status, engineState.currentTrack, loadPreview]);

  // Once a snapshot reaches "playing", disarm UI-21 — a late error event
  // (mid-stream stall, network drop) should not trigger a re-resolve.
  useEffect(() => {
    if (engineState.status !== "playing") return;
    const current = engineState.currentTrack?.snapshot;
    if (!current) return;
    if (snapshotsMatch(loadedViaCacheRef.current, current)) {
      loadedViaCacheRef.current = null;
    }
    retriedKeysRef.current.add(snapshotKey(current));
  }, [engineState.status, engineState.currentTrack]);

  // UI-22: once the current track is within HANDOFF_LOOKAHEAD_MS of its
  // duration (LOGIC-23 flips true), refresh the next-in-queue's cached
  // URL via /play/resolve. Latched per (current, next) pair: any change
  // to either snapshot resets the latch so a subsequent near-end fires a
  // fresh refresh. Failures are silently swallowed — UI-21 catches the
  // fallthrough if the still-stale URL is then played.
  const refreshedPairsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (engineState.status !== "playing") return;
    const current = engineState.currentTrack?.snapshot;
    if (!current || !next) return;
    // During the swipe-transition window (engine.currentTrack still points
    // at the previous top, queue has already advanced) the refresh decision
    // for the just-leaving pair is stale — guard against firing a redundant
    // refresh on the wrong (current → next) edge.
    if (!snapshotsMatch(current, top)) return;
    const flip = playableHandoffDecision({
      progressMs: engineState.progressMs,
      durationMs: engineState.durationMs,
      lookaheadMs: HANDOFF_LOOKAHEAD_MS,
    });
    if (!flip) return;
    const pairKey = `${snapshotKey(current)}→${snapshotKey(next)}`;
    if (refreshedPairsRef.current.has(pairKey)) return;
    refreshedPairsRef.current.add(pairKey);

    const nextKey = snapshotKey(next);
    void resolveStream({ snapshot: next })
      .then((res) => {
        if (res.streamUrl === null) return;
        resolveCache.current.set(nextKey, res.streamUrl);
      })
      .catch(() => {
        // Silent — UI-21 catches any 403 on the actual handoff.
      });
  }, [
    top,
    next,
    engineState.status,
    engineState.currentTrack,
    engineState.progressMs,
    engineState.durationMs,
  ]);

  return { isRecovering };
}

function snapshotKey(s: SongSnapshot): string {
  return `${s.title.trim().toLowerCase()}|${s.artist.trim().toLowerCase()}|${s.durationSec ?? "?"}`;
}
