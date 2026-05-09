import { createHash } from "crypto";
import type { SongSnapshot } from "@moc/contracts";

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

export function computeSnapshotHash(snapshot: SongSnapshot): string {
  const title = normalizeText(snapshot.title);
  const artist = normalizeText(snapshot.artist);
  const duration =
    typeof snapshot.durationSec === "number" ? String(snapshot.durationSec) : "unknown";
  return createHash("sha256").update(`${title}|${artist}|${duration}`).digest("hex");
}
