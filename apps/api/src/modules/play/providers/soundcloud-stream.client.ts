import { Injectable, Logger, Inject } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { SongSnapshot } from "@moc/contracts";
import { extractSourceFromHtml, extractClientId, pickBestMatch, type AudiusCandidate } from "@moc/api-core";

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const STREAM_LIFETIME_MS = 55 * 60 * 1000;

export interface SoundCloudFindResult {
  sourceTrackId: string;
  sourceLocator: string;
}

export interface SoundCloudStreamUrlResult {
  streamUrl: string;
  expiresAt: string;
}

@Injectable()
export class SoundCloudStreamClient {
  private readonly logger = new Logger(SoundCloudStreamClient.name);
  private readonly userAgent: string;

  constructor(@Inject(ConfigService) config: ConfigService) {
    this.userAgent = config.get<string>("SOUNDCLOUD_USER_AGENT", DEFAULT_USER_AGENT);
  }

  async findMatch(snapshot: SongSnapshot): Promise<SoundCloudFindResult | null> {
    const query = `${snapshot.title} ${snapshot.artist}`.trim();
    const searchPageUrl = `https://soundcloud.com/search/sounds?q=${encodeURIComponent(query)}`;

    const html = await this.fetchHtml(searchPageUrl);
    const clientId = extractClientId(html);

    if (clientId) {
      const apiResult = await this.findViaApi(snapshot, query, clientId);
      if (apiResult) return apiResult;
    }

    // Fallback: parse SSR hydration from the search page
    return this.findViaHydration(snapshot, html);
  }

  async produceStreamUrl(sourceLocator: string): Promise<SoundCloudStreamUrlResult | null> {
    const html = await this.fetchHtml(sourceLocator);
    const parsed = extractSourceFromHtml(html);

    if (parsed) {
      const result = await this.streamFromParsed(parsed);
      if (result) return result;
    }

    // Fallback: use resolve API with client_id extracted from the same page HTML
    const clientId = extractClientId(html);
    if (!clientId) return null;
    return await this.streamViaResolveApi(sourceLocator, clientId);
  }

  // ── private helpers ──────────────────────────────────────────────────────────

  private async findViaApi(
    snapshot: SongSnapshot,
    query: string,
    clientId: string,
  ): Promise<SoundCloudFindResult | null> {
    const url = new URL("https://api-v2.soundcloud.com/search/tracks");
    url.searchParams.set("q", query);
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("limit", "5");

    try {
      const res = await fetch(url.toString(), {
        headers: { Accept: "application/json", "User-Agent": this.userAgent },
      });
      if (!res.ok) return null;
      const body = (await res.json()) as { collection?: unknown[] };
      const items = Array.isArray(body.collection) ? body.collection : [];
      return this.pickFromItems(snapshot, items as RawSearchTrack[]);
    } catch {
      return null;
    }
  }

  private findViaHydration(snapshot: SongSnapshot, html: string): SoundCloudFindResult | null {
    return this.pickFromItems(snapshot, collectSearchHydration(html));
  }

  private pickFromItems(
    snapshot: SongSnapshot,
    items: RawSearchTrack[],
  ): SoundCloudFindResult | null {
    const candidates = items
      .map((it) => toCandidate(it))
      .filter((c): c is AudiusCandidate & { permalink: string } => c !== null);
    const match = pickBestMatch(snapshot, candidates);
    if (!match) return null;
    const winner = candidates.find((c) => c.id === match.sourceTrackId);
    if (!winner) return null;
    return { sourceTrackId: winner.id, sourceLocator: winner.permalink };
  }

  private async streamFromParsed(
    parsed: ReturnType<typeof extractSourceFromHtml>,
  ): Promise<SoundCloudStreamUrlResult | null> {
    if (!parsed) return null;
    // Prefer full (non-snipped) progressive; fall back to any non-snipped transcoding (e.g. HLS).
    // Never return a snipped/preview transcoding — callers expect a full stream URL.
    const transcoding =
      parsed.transcodings.find((t) => t.protocol === "progressive" && !t.snipped) ??
      parsed.transcodings.find((t) => !t.snipped);
    if (!transcoding) return null;

    const transcodingUrl = new URL(transcoding.url);
    transcodingUrl.searchParams.set("client_id", parsed.clientId);
    const res = await fetch(transcodingUrl.toString(), {
      headers: { Accept: "application/json", "User-Agent": this.userAgent },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { url?: unknown };
    const streamUrl = typeof body.url === "string" ? body.url : "";
    if (!streamUrl) return null;
    return { streamUrl, expiresAt: new Date(Date.now() + STREAM_LIFETIME_MS).toISOString() };
  }

  private async streamViaResolveApi(
    permalink: string,
    clientId: string,
  ): Promise<SoundCloudStreamUrlResult | null> {
    const resolveUrl = new URL("https://api-v2.soundcloud.com/resolve");
    resolveUrl.searchParams.set("url", permalink);
    resolveUrl.searchParams.set("client_id", clientId);

    try {
      const res = await fetch(resolveUrl.toString(), {
        headers: { Accept: "application/json", "User-Agent": this.userAgent },
      });
      if (!res.ok) return null;

      type RawTranscoding = { url?: string; format?: { protocol?: string }; snipped?: boolean };
      const track = (await res.json()) as { media?: { transcodings?: RawTranscoding[] } };
      const transcodings = Array.isArray(track.media?.transcodings)
        ? track.media.transcodings
        : [];
      // Prefer full (non-snipped) progressive; fall back to any non-snipped transcoding (e.g. HLS).
      const progressive =
        transcodings.find((t) => t.format?.protocol === "progressive" && t.snipped !== true) ??
        transcodings.find((t) => t.snipped !== true);
      if (!progressive?.url) return null;

      const transcodingUrl = new URL(progressive.url);
      transcodingUrl.searchParams.set("client_id", clientId);
      const streamRes = await fetch(transcodingUrl.toString(), {
        headers: { Accept: "application/json", "User-Agent": this.userAgent },
      });
      if (!streamRes.ok) return null;

      const streamBody = (await streamRes.json()) as { url?: unknown };
      const streamUrl = typeof streamBody.url === "string" ? streamBody.url : "";
      if (!streamUrl) return null;
      return { streamUrl, expiresAt: new Date(Date.now() + STREAM_LIFETIME_MS).toISOString() };
    } catch {
      return null;
    }
  }

  private async fetchHtml(url: string): Promise<string> {
    const res = await fetch(url, {
      headers: { Accept: "text/html", "User-Agent": this.userAgent },
    });
    if (!res.ok) throw new Error(`SoundCloud responded ${res.status}`);
    return await res.text();
  }
}

interface RawSearchTrack {
  id?: unknown;
  title?: unknown;
  permalink_url?: unknown;
  duration?: unknown;
  user?: { username?: unknown };
}

function collectSearchHydration(html: string): RawSearchTrack[] {
  const re = /window\.__sc_hydration\s*=\s*(\[[\s\S]*?\]);/;
  const match = re.exec(html);
  if (!match || typeof match[1] !== "string") return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(match[1]);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const tracks: RawSearchTrack[] = [];
  for (const entry of parsed as Array<{ hydratable?: unknown; data?: unknown }>) {
    if (entry.hydratable === "search" && entry.data && typeof entry.data === "object") {
      const collection = (entry.data as { collection?: unknown }).collection;
      if (Array.isArray(collection)) {
        for (const item of collection) {
          if (item && typeof item === "object") tracks.push(item as RawSearchTrack);
        }
      }
    }
  }
  return tracks;
}

function toCandidate(raw: RawSearchTrack): (AudiusCandidate & { permalink: string }) | null {
  const id = typeof raw.id === "string" ? raw.id : typeof raw.id === "number" ? String(raw.id) : "";
  if (!id) return null;
  const title = typeof raw.title === "string" ? raw.title : "";
  const artist = typeof raw.user?.username === "string" ? raw.user.username : "";
  const durationMs = typeof raw.duration === "number" ? raw.duration : 0;
  const durationSec = Math.round(durationMs / 1000);
  const permalink = typeof raw.permalink_url === "string" ? raw.permalink_url : "";
  if (!permalink) return null;
  return { id, title, artist, durationSec, permalink };
}
