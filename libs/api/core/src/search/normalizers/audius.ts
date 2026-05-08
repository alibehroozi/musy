import { TrackResult } from "@moc/contracts";

export interface RawAudiusTrack {
  id?: unknown;
  title?: unknown;
  user?: { name?: unknown };
  duration?: unknown;
  artwork?: { "150x150"?: unknown };
}

export function normalizeAudiusTrack(raw: RawAudiusTrack): TrackResult | null {
  const id = typeof raw.id === "string" ? raw.id : String(raw.id ?? "");
  if (!id) return null;
  const artwork =
    raw.artwork && typeof raw.artwork["150x150"] === "string" ? raw.artwork["150x150"] : undefined;
  const result = TrackResult.safeParse({
    type: "track",
    id: `audius:${id}`,
    title: typeof raw.title === "string" ? raw.title : "(unknown)",
    artist: typeof raw.user?.name === "string" && raw.user.name ? raw.user.name : "(unknown)",
    duration: typeof raw.duration === "number" ? raw.duration : undefined,
    ...(artwork !== undefined ? { artworkUrl: artwork } : {}),
    provider: "audius",
    providerId: id,
    sources: ["audius"],
  });
  return result.success ? result.data : null;
}
