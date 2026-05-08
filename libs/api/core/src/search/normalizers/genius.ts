import { TrackResult } from "@moc/contracts";

export interface RawGeniusHit {
  result?: {
    id?: unknown;
    title?: unknown;
    primary_artist?: { name?: unknown };
    header_image_thumbnail_url?: unknown;
    url?: unknown;
  };
}

export function normalizeGeniusHit(raw: RawGeniusHit): TrackResult | null {
  const r = raw.result ?? {};
  const id = r.id !== undefined ? String(r.id) : "";
  if (!id) return null;
  const artworkUrl =
    typeof r.header_image_thumbnail_url === "string" && r.header_image_thumbnail_url
      ? r.header_image_thumbnail_url
      : undefined;
  const externalUrl = typeof r.url === "string" && r.url ? r.url : undefined;
  const result = TrackResult.safeParse({
    type: "track",
    id: `genius:${id}`,
    title: typeof r.title === "string" && r.title ? r.title : "(unknown)",
    artist:
      r.primary_artist && typeof r.primary_artist.name === "string" && r.primary_artist.name
        ? r.primary_artist.name
        : "(unknown)",
    ...(artworkUrl !== undefined ? { artworkUrl } : {}),
    ...(externalUrl !== undefined ? { externalUrl } : {}),
    provider: "genius",
    providerId: id,
    sources: ["genius"],
  });
  return result.success ? result.data : null;
}
