import { useEffect } from "react";
import type { SongSnapshot } from "@moc/contracts";

interface UseMediaSessionArgs {
  snapshot: SongSnapshot | null;
  isPlaying: boolean;
  onPlayPause: () => void;
  onSkipBack: () => void;
}

/**
 * Wires `navigator.mediaSession` so the OS-level lock-screen / notification
 * card reflects the current track and routes its play/pause/skip-prev
 * controls back into the player. Skip-next is intentionally unset for v1
 * (no queue) — leaving the action handler unset hides the button on the
 * lock screen.
 *
 * No-op when the API is unavailable (older Safari, jsdom) so the player
 * still mounts cleanly. PWA-02 verifies both branches.
 */
export function useMediaSession({
  snapshot,
  isPlaying,
  onPlayPause,
  onSkipBack,
}: UseMediaSessionArgs): void {
  useEffect(() => {
    if (typeof navigator === "undefined") return;
    const ms = navigator.mediaSession as MediaSession | undefined;
    if (!ms || typeof ms.setActionHandler !== "function") return;

    if (snapshot === null) {
      ms.metadata = null;
      return;
    }

    const artwork =
      snapshot.coverUrl !== undefined
        ? [{ src: snapshot.coverUrl, sizes: "512x512", type: "image/png" }]
        : [];

    ms.metadata = new MediaMetadata({
      title: snapshot.title,
      artist: snapshot.artist,
      artwork,
    });

    ms.setActionHandler("play", () => onPlayPause());
    ms.setActionHandler("pause", () => onPlayPause());
    ms.setActionHandler("previoustrack", () => onSkipBack());

    try {
      ms.playbackState = isPlaying ? "playing" : "paused";
    } catch {
      // Older browsers don't support playbackState; ignore.
    }
  }, [snapshot, isPlaying, onPlayPause, onSkipBack]);
}
