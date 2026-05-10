import { TrackResult } from "@moc/contracts";

export interface RawSoundCloudSearchHit {
  id?: unknown;
  title?: unknown;
  permalink_url?: unknown;
  duration?: unknown;
  artwork_url?: unknown;
  user?: { username?: unknown };
  publisher_metadata?: { isrc?: unknown };
}

export function normalizeSoundCloudSearchHit(raw: RawSoundCloudSearchHit): TrackResult | null {
  const id = typeof raw.id === "number" || typeof raw.id === "string" ? String(raw.id) : undefined;
  if (!id) return null;
  const permalink = typeof raw.permalink_url === "string" ? raw.permalink_url : undefined;
  if (!permalink) return null;
  const title = typeof raw.title === "string" ? raw.title : undefined;
  if (!title) return null;

  const artist =
    typeof raw.user?.username === "string" && raw.user.username ? raw.user.username : "(unknown)";
  // SoundCloud reports duration in milliseconds; the rest of moc carries seconds.
  const durationSec =
    typeof raw.duration === "number" ? Math.max(0, Math.round(raw.duration / 1000)) : undefined;
  const artwork = typeof raw.artwork_url === "string" ? raw.artwork_url : undefined;
  const isrc =
    typeof raw.publisher_metadata?.isrc === "string" ? raw.publisher_metadata.isrc : undefined;

  const result = TrackResult.safeParse({
    type: "track",
    id: `soundcloud:${id}`,
    title,
    artist,
    ...(durationSec !== undefined ? { duration: durationSec } : {}),
    ...(artwork !== undefined ? { artworkUrl: artwork } : {}),
    externalUrl: permalink,
    ...(isrc !== undefined ? { isrc } : {}),
    provider: "soundcloud" as const,
    providerId: id,
    sources: ["soundcloud" as const],
  });
  return result.success ? result.data : null;
}
