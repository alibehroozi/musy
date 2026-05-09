import type { SongSnapshot } from "@moc/contracts";

export interface AudiusCandidate {
  id: string;
  title: string;
  artist: string;
  durationSec: number;
}

export interface AudiusMatch {
  sourceTrackId: string;
}

const TITLE_DIFF_TOLERANCE = 0.5;
const ARTIST_DIFF_TOLERANCE = 0.5;
const DURATION_TOLERANCE_SEC = 5;

function normalize(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[‘’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value: string): string[] {
  const norm = normalize(value);
  return norm.length === 0 ? [] : norm.split(" ");
}

function jaccardDistance(a: string, b: string): number {
  const setA = new Set(tokens(a));
  const setB = new Set(tokens(b));
  if (setA.size === 0 && setB.size === 0) return 0;
  let intersection = 0;
  for (const t of setA) if (setB.has(t)) intersection += 1;
  const union = setA.size + setB.size - intersection;
  if (union === 0) return 1;
  return 1 - intersection / union;
}

export function pickBestMatch(
  snapshot: SongSnapshot,
  candidates: AudiusCandidate[],
): AudiusMatch | null {
  const desiredDuration = snapshot.durationSec;
  let best: { score: number; id: string } | null = null;
  for (const c of candidates) {
    const titleDist = jaccardDistance(snapshot.title, c.title);
    if (titleDist > TITLE_DIFF_TOLERANCE) continue;
    const artistDist = jaccardDistance(snapshot.artist, c.artist);
    if (artistDist > ARTIST_DIFF_TOLERANCE) continue;
    if (
      typeof desiredDuration === "number" &&
      Math.abs(c.durationSec - desiredDuration) > DURATION_TOLERANCE_SEC
    ) {
      continue;
    }
    const score = titleDist + artistDist;
    if (!best || score < best.score) {
      best = { score, id: c.id };
    }
  }
  return best ? { sourceTrackId: best.id } : null;
}
