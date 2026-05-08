import { useEffect } from "react";
import type { SongSnapshot } from "@moc/contracts";

export function useMediaSession(
  track: SongSnapshot | null,
  onTogglePlay: () => void,
  onSkipPrev: () => void,
): void {
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;

    if (track === null) {
      navigator.mediaSession.metadata = null;
      return;
    }

    const artwork: MediaImage[] =
      track.coverUrl !== undefined
        ? [{ src: track.coverUrl, sizes: "512x512", type: "image/jpeg" }]
        : [];

    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist,
      artwork,
    });
  }, [track]);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;

    navigator.mediaSession.setActionHandler("play", onTogglePlay);
    navigator.mediaSession.setActionHandler("pause", onTogglePlay);
    navigator.mediaSession.setActionHandler("previoustrack", onSkipPrev);
    navigator.mediaSession.setActionHandler("nexttrack", null);

    return () => {
      if (!("mediaSession" in navigator)) return;
      navigator.mediaSession.setActionHandler("play", null);
      navigator.mediaSession.setActionHandler("pause", null);
      navigator.mediaSession.setActionHandler("previoustrack", null);
      navigator.mediaSession.setActionHandler("nexttrack", null);
    };
  }, [onTogglePlay, onSkipPrev]);
}
