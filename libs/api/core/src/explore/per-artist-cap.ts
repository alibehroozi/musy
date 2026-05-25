import type { SongSnapshot } from "@moc/contracts";

/**
 * LOGIC-43: drops snapshots whose artist (case-insensitive, trimmed) has
 * already appeared `cap` times in the survivors. Preserves input order.
 * Does not mutate input.
 *
 * Default cap = 2 — high enough to keep "two strong picks per artist"
 * variety while low enough to prevent a single deep-catalog artist from
 * steamrolling the queue.
 */
export function applyPerArtistCap(
  snapshots: ReadonlyArray<SongSnapshot>,
  cap: number = 2,
): SongSnapshot[] {
  const counts = new Map<string, number>();
  const out: SongSnapshot[] = [];
  for (const snap of snapshots) {
    const key = snap.artist.trim().toLowerCase();
    const seen = counts.get(key) ?? 0;
    if (seen >= cap) continue;
    counts.set(key, seen + 1);
    out.push(snap);
  }
  return out;
}
