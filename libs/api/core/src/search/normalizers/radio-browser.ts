import { StationResult } from "@moc/contracts";

export interface RawRadioBrowserStation {
  stationuuid?: unknown;
  name?: unknown;
  url?: unknown;
  url_resolved?: unknown;
  homepage?: unknown;
  country?: unknown;
  language?: unknown;
  tags?: unknown;
  favicon?: unknown;
}

export function normalizeRadioBrowserStation(raw: RawRadioBrowserStation): StationResult | null {
  const id = typeof raw.stationuuid === "string" ? raw.stationuuid : "";
  if (!id) return null;
  const streamUrl =
    typeof raw.url_resolved === "string" && raw.url_resolved
      ? raw.url_resolved
      : typeof raw.url === "string" && raw.url
        ? raw.url
        : undefined;
  const homepage = typeof raw.homepage === "string" && raw.homepage ? raw.homepage : undefined;
  const country = typeof raw.country === "string" && raw.country ? raw.country : undefined;
  const language = typeof raw.language === "string" && raw.language ? raw.language : undefined;
  const favicon = typeof raw.favicon === "string" && raw.favicon ? raw.favicon : undefined;
  const tags =
    typeof raw.tags === "string" && raw.tags
      ? raw.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
      : undefined;

  const result = StationResult.safeParse({
    type: "station",
    id: `radio-browser:${id}`,
    name: typeof raw.name === "string" && raw.name ? raw.name : "(unknown)",
    ...(streamUrl !== undefined ? { streamUrl } : {}),
    ...(homepage !== undefined ? { homepage } : {}),
    ...(country !== undefined ? { country } : {}),
    ...(language !== undefined ? { language } : {}),
    ...(tags !== undefined ? { tags } : {}),
    ...(favicon !== undefined ? { favicon } : {}),
    provider: "radio-browser",
    providerId: id,
    sources: ["radio-browser"],
  });
  return result.success ? result.data : null;
}
