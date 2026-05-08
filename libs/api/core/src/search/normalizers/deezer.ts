import { TrackResult } from "@moc/contracts";

export interface RawDeezerTrack {
  id?: unknown;
  title?: unknown;
  artist?: { name?: unknown };
  album?: { title?: unknown; cover_medium?: unknown };
  duration?: unknown;
  preview?: unknown;
  link?: unknown;
  isrc?: unknown;
}

export function normalizeDeezerTrack(raw: RawDeezerTrack): TrackResult | null {
  const id = raw.id !== undefined ? String(raw.id) : "";
  if (!id) return null;
  const album = raw.album && typeof raw.album.title === "string" ? raw.album.title : undefined;
  const artworkUrl =
    raw.album && typeof raw.album.cover_medium === "string" ? raw.album.cover_medium : undefined;
  const previewUrl = typeof raw.preview === "string" ? raw.preview : undefined;
  const externalUrl = typeof raw.link === "string" ? raw.link : undefined;
  const isrc = typeof raw.isrc === "string" ? raw.isrc : undefined;
  const result = TrackResult.safeParse({
    type: "track",
    id: `deezer:${id}`,
    title: typeof raw.title === "string" ? raw.title : "(unknown)",
    artist:
      raw.artist && typeof raw.artist.name === "string" && raw.artist.name
        ? raw.artist.name
        : "(unknown)",
    duration: typeof raw.duration === "number" ? raw.duration : undefined,
    ...(album !== undefined ? { album } : {}),
    ...(artworkUrl !== undefined ? { artworkUrl } : {}),
    ...(previewUrl !== undefined ? { previewUrl } : {}),
    ...(externalUrl !== undefined ? { externalUrl } : {}),
    ...(isrc !== undefined ? { isrc } : {}),
    provider: "deezer",
    providerId: id,
    sources: ["deezer"],
  });
  return result.success ? result.data : null;
}
