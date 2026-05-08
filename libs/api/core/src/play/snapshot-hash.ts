import { createHash } from "crypto";
import type { SongSnapshot } from "@moc/contracts";

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

export function computeSnapshotHash(
  snapshot: Pick<SongSnapshot, "title" | "artist" | "durationSec">,
): string {
  const key = `${normalize(snapshot.title)}|${normalize(snapshot.artist)}|${snapshot.durationSec ?? ""}`;
  return createHash("sha256").update(key).digest("hex");
}
