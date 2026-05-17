import type { ProviderName } from "@moc/contracts";

/**
 * Inverse of `songKeyOf(source, externalId)` in `@moc/api-core` —
 * songKey is always `${source}:${externalId}`. The split is on the
 * FIRST `:` only so externalIds containing colons (rare but possible)
 * stay intact.
 *
 * Returns `null` when the input is malformed — empty string, missing
 * separator, unknown source. The caller (bucket-detail row click) is
 * expected to treat null as "this row cannot be played" rather than
 * crashing the page.
 */
const KNOWN_SOURCES: ReadonlyArray<ProviderName> = [
  "audius",
  "deezer",
  "radio-browser",
  "genius",
  "soundcloud",
];

export function splitSongKey(songKey: string): { source: ProviderName; externalId: string } | null {
  if (typeof songKey !== "string" || songKey.length === 0) return null;
  const sep = songKey.indexOf(":");
  if (sep <= 0 || sep === songKey.length - 1) return null;
  const source = songKey.slice(0, sep);
  const externalId = songKey.slice(sep + 1);
  if (!(KNOWN_SOURCES as readonly string[]).includes(source)) return null;
  return { source: source as ProviderName, externalId };
}
