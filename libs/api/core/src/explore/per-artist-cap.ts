import type { SongSnapshot } from "@moc/contracts";

export function applyPerArtistCap(
  _snapshots: ReadonlyArray<SongSnapshot>,
  _cap: number = 2,
): SongSnapshot[] {
  throw new Error("applyPerArtistCap: not implemented");
}
