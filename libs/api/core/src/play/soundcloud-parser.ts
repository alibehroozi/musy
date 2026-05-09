export interface SoundCloudTranscoding {
  url: string;
  protocol: string;
  mimeType: string;
  snipped: boolean;
}

export interface ExtractedSoundCloudSource {
  sourceTrackId: string;
  clientId: string;
  transcodings: SoundCloudTranscoding[];
}

const HYDRATION_RE = /window\.__sc_hydration\s*=\s*(\[[\s\S]*?\]);/;
const CLIENT_ID_RE = /client_id\s*[=:]\s*"?([A-Za-z0-9_-]{16,})"?/;
const CLIENT_ID_CAMEL_RE = /"clientId"\s*:\s*"([A-Za-z0-9_-]{16,})"/;

interface HydrationItem {
  hydratable?: unknown;
  data?: unknown;
}

interface RawTranscoding {
  url?: unknown;
  format?: { protocol?: unknown; mime_type?: unknown };
  snipped?: unknown;
}

interface RawTrackData {
  id?: unknown;
  media?: { transcodings?: unknown };
}

function parseHydration(html: string): HydrationItem[] | null {
  const match = HYDRATION_RE.exec(html);
  if (!match || typeof match[1] !== "string") return null;
  try {
    const parsed: unknown = JSON.parse(match[1]);
    return Array.isArray(parsed) ? (parsed as HydrationItem[]) : null;
  } catch {
    return null;
  }
}

function pickTrack(items: HydrationItem[]): RawTrackData | null {
  for (const item of items) {
    if (item.hydratable === "sound" && item.data && typeof item.data === "object") {
      return item.data as RawTrackData;
    }
  }
  return null;
}

function normalizeTranscodings(raw: unknown): SoundCloudTranscoding[] {
  if (!Array.isArray(raw)) return [];
  const out: SoundCloudTranscoding[] = [];
  for (const t of raw as RawTranscoding[]) {
    if (typeof t.url !== "string") continue;
    const protocol = typeof t.format?.protocol === "string" ? t.format.protocol : "progressive";
    const mimeType = typeof t.format?.mime_type === "string" ? t.format.mime_type : "audio/mpeg";
    const snipped = t.snipped === true;
    out.push({ url: t.url, protocol, mimeType, snipped });
  }
  return out;
}

export function extractClientId(html: string): string | null {
  // Primary: SoundCloud embeds the client_id in the apiClient hydration item.
  const items = parseHydration(html);
  if (items) {
    const apiClientItem = items.find((item) => item.hydratable === "apiClient");
    const id = (apiClientItem?.data as { id?: unknown } | undefined)?.id;
    if (typeof id === "string" && id.length >= 16) return id;
  }
  // Fallback: test HTML or older SoundCloud pages may use inline patterns.
  const m = CLIENT_ID_RE.exec(html) ?? CLIENT_ID_CAMEL_RE.exec(html);
  return m && typeof m[1] === "string" ? m[1] : null;
}

export function extractSourceFromHtml(html: string): ExtractedSoundCloudSource | null {
  const items = parseHydration(html);
  if (!items) return null;

  const track = pickTrack(items);
  if (!track) return null;

  const id = typeof track.id === "number" || typeof track.id === "string" ? String(track.id) : "";
  if (!id) return null;

  const transcodings = normalizeTranscodings(track.media?.transcodings);
  if (transcodings.length === 0) return null;

  const clientId = extractClientId(html);
  if (!clientId) return null;

  return { sourceTrackId: id, clientId, transcodings };
}
