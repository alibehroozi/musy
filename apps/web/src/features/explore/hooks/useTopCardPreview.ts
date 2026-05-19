import { useCallback, useEffect, useRef } from "react";
import { snapshotsMatch, playableHandoffDecision } from "@moc/web-core";
import type { SongSnapshot } from "@moc/contracts";
import { usePlayer } from "../../player/usePlayer.js";
import { useExploreContext, useExploreTopCard } from "../ExploreTopCardContext.js";
import { resolveStream } from "../../player/api.js";

// Only the immediately-next card is pre-resolved. The previous value (5)
// fired five /play/resolve requests on every fresh ExplorePage mount,
// which made navigating away and back to /explore expensive on a cold
// per-mount cache. With the cache now provider-scoped (survives mounts)
// and the lookahead at 1, a cold mount fires at most one pre-resolve.
const PRE_RESOLVE_AHEAD = 1;
const HANDOFF_LOOKAHEAD_MS = 5_000;

/**
 * Wires the top card's snapshot into the existing PlayerProvider's
 * `playPreview`/`loadPreview` and publishes it to ExploreTopCardContext
 * so the docked mini-player knows to hide (UI-16).
 *
 * Also pre-resolves the next PRE_RESOLVE_AHEAD cards so their stream
 * URLs are ready when they become the top card, enabling the volume-dip
 * crossfade to start immediately without a blocking /play/resolve round-trip.
 *
 * UI-21: whenever the audio engine enters `failed` for the current top
 * card — regardless of how it was loaded (playPreview's resolve+load
 * path OR loadPreview's cache fast-path) and regardless of which
 * underlying failure produced it (audio `error`, network rejection on
 * /play/resolve, or `streamUrl: null` body) — re-issue
 * `POST /api/play/resolve` once. The backend regenerates a fresh signed
 * URL on every call, so a stale 403'd signed URL is the most common
 * recoverable case. The retry latch is per-(snapshot, mount).
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
 *
 * UI-30: this hook never advances the queue on its own. A failed retry
 * leaves the card on the deck; only a user-driven swipe removes it.
 *
 * UI-31: returns `getCachedStreamUrl` so ExplorePage's OS Media Session
 * `nexttrack` / `previoustrack` handlers can read the next snapshot's
 * pre-resolved URL synchronously inside the user-gesture window and
 * call `loadPreviewSync` before triggering the async queue advancement.
 * The cache is the same Map populated by this hook's lookahead — no
 * separate state.
 */
export interface UseTopCardPreviewResult {
  /** Returns the cached pre-resolved stream URL for `snap`, or `null` if
   *  the snapshot isn't yet resolved (or resolved to `null`). */
  getCachedStreamUrl: (snap: SongSnapshot) => string | null;
}

export function useTopCardPreview(items: SongSnapshot[]): UseTopCardPreviewResult {
  const top = items[0] ?? null;
  const next = items[1] ?? null;
  const { playPreview, loadPreview, pause, engineState } = usePlayer();
  const { setTopCard } = useExploreTopCard();
  // Provider-scoped caches — survive ExplorePage mount/unmount so a
  // tab-switch away from /explore and back does NOT re-fire /play/resolve
  // for snapshots already cached, and UI-21's retry latch is not
  // re-armed for snapshots that already burned their single retry.
  const { caches } = useExploreContext();
  const resolveCache = caches.resolve;
  const resolvingKeys = caches.inFlight;
  const retriedKeys = caches.retried;
  const refreshedPairs = caches.handoffRefreshed;

  useEffect(() => {
    setTopCard(top);
    return () => setTopCard(null);
  }, [top, setTopCard]);

  // Pre-resolve cards [1..PRE_RESOLVE_AHEAD] ahead of the top card.
  useEffect(() => {
    const ahead = items.slice(1, 1 + PRE_RESOLVE_AHEAD);
    for (const snap of ahead) {
      const k = snapshotKey(snap);
      if (resolveCache.has(k) || resolvingKeys.has(k)) continue;
      resolvingKeys.add(k);
      resolveStream({ snapshot: snap })
        .then((res) => {
          resolveCache.set(k, res.streamUrl);
        })
        .catch(() => {
          // Leave absent — playPreview will retry via /play/resolve if needed.
        })
        .finally(() => {
          resolvingKeys.delete(k);
        });
    }
  }, [items, resolveCache, resolvingKeys]);

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

  // UI-21 latch: snapshot keys we've already retried this page session, so
  // a second error doesn't hot-loop AND a remount of ExplorePage doesn't
  // re-arm the retry. Once a snapshot reaches "playing", we also add it
  // so a late mid-stream error doesn't trigger a retry on a healthy
  // stream. Sourced from ExploreTopCardContext's `caches.retried` so the
  // set survives ExplorePage unmount/remount (see UI-21).

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

    const cached = resolveCache.get(snapshotKey(top));
    if (cached !== undefined && cached !== null) {
      loadPreview(top, cached);
    } else {
      playPreview(top);
    }
  }, [top, playPreview, loadPreview, pause, resolveCache]);

  // UI-21 + UI-25 + UI-30: on any engine "failed" for the current top
  // card — regardless of whether it was loaded via the cache fast-path
  // or via playPreview's resolve+load — drop the stale cache entry and
  // re-resolve once. When the retry resolves, gate `loadPreview` on the
  // snapshot still being the top card (UI-25). If the retry produces no
  // playable stream (null body, network rejection, or a second engine
  // error after the retry's load), the card REMAINS on the deck — there
  // is no auto-skip (UI-30). The latch is per-(snapshot, mount).
  useEffect(() => {
    if (engineState.status !== "failed") return;
    const current = engineState.currentTrack?.snapshot;
    if (!current) return;
    const key = snapshotKey(current);
    if (retriedKeys.has(key)) return;
    retriedKeys.add(key);
    resolveCache.delete(key);

    void resolveStream({ snapshot: current })
      .then((res) => {
        // UI-25: the user (or any other code path) may have swiped past
        // `current` while the retry was in flight. Loading the fresh URL
        // now would replace whatever is playing on the new top card with
        // the stale snapshot's audio. Silently discard.
        if (!snapshotsMatch(topRef.current, current)) return;
        if (res.streamUrl === null) return;
        resolveCache.set(key, res.streamUrl);
        loadPreview(current, res.streamUrl);
      })
      .catch(() => {
        // Silent — engine stays in "failed", card stays on the deck per
        // UI-30 until the user swipes.
      });
  }, [engineState.status, engineState.currentTrack, loadPreview, retriedKeys, resolveCache]);

  // Once a snapshot reaches "playing", lock its retry latch so a late
  // mid-stream error (network drop, decode glitch) does not re-trigger
  // resolution.
  useEffect(() => {
    if (engineState.status !== "playing") return;
    const current = engineState.currentTrack?.snapshot;
    if (!current) return;
    retriedKeys.add(snapshotKey(current));
  }, [engineState.status, engineState.currentTrack, retriedKeys]);

  // UI-22: once the current track is within HANDOFF_LOOKAHEAD_MS of its
  // duration (LOGIC-23 flips true), refresh the next-in-queue's cached
  // URL via /play/resolve. Latched per (current, next) pair using the
  // provider-scoped set — survives ExplorePage unmount/remount so
  // navigating away and back doesn't re-fire a refresh that already
  // burned its turn. Failures are silently swallowed — UI-21 catches
  // the fallthrough if the still-stale URL is then played.
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
    if (refreshedPairs.has(pairKey)) return;
    refreshedPairs.add(pairKey);

    const nextKey = snapshotKey(next);
    void resolveStream({ snapshot: next })
      .then((res) => {
        if (res.streamUrl === null) return;
        resolveCache.set(nextKey, res.streamUrl);
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
    resolveCache,
    refreshedPairs,
  ]);

  // UI-31: expose the resolve cache to ExplorePage's on-screen ✕ / ♥
  // buttons (the OS Media Session next/prev handlers read the same
  // cache directly via `ExploreMediaBridge`, see UI-40). The cache
  // identity is stable for the lifetime of ExploreTopCardProvider, so
  // callers can rely on this closure to see the latest entries.
  const getCachedStreamUrl = useCallback(
    (snap: SongSnapshot): string | null => {
      return resolveCache.get(snapshotKey(snap)) ?? null;
    },
    [resolveCache],
  );

  return { getCachedStreamUrl };
}

function snapshotKey(s: SongSnapshot): string {
  return `${s.title.trim().toLowerCase()}|${s.artist.trim().toLowerCase()}|${s.durationSec ?? "?"}`;
}
