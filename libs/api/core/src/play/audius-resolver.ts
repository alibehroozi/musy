import type { SongSnapshot } from "@moc/contracts";

export interface RawAudiusTrackResult {
  id: string;
  title?: string;
  user?: { name?: string };
  duration?: number;
}

export interface AudiusMatch {
  sourceTrackId: string;
}

const DURATION_TOLERANCE_SEC = 10;

export function pickBestMatch(
  snapshot: Pick<SongSnapshot, "title" | "artist" | "durationSec">,
  results: RawAudiusTrackResult[],
): AudiusMatch | null {
  if (results.length === 0) return null;

  const needle = {
    title: snapshot.title.trim().toLowerCase(),
    artist: snapshot.artist.trim().toLowerCase(),
  };

  for (const track of results) {
    const trackTitle = (track.title ?? "").trim().toLowerCase();
    const trackArtist = (track.user?.name ?? "").trim().toLowerCase();

    if (!trackTitle.includes(needle.title) && !needle.title.includes(trackTitle)) continue;
    if (!trackArtist.includes(needle.artist) && !needle.artist.includes(trackArtist)) continue;

    if (
      snapshot.durationSec !== undefined &&
      track.duration !== undefined &&
      Math.abs(track.duration - snapshot.durationSec) > DURATION_TOLERANCE_SEC
    ) {
      continue;
    }

    return { sourceTrackId: track.id };
  }

  return null;
}
