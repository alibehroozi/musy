import { Injectable, Logger, Inject } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { SongSnapshot } from "@moc/contracts";
import { extractSourceFromHtml, pickBestMatch, type AudiusCandidate } from "@moc/api-core";

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
    const query = encodeURIComponent(`${snapshot.title} ${snapshot.artist}`.trim());
    const searchUrl = `https://soundcloud.com/search/sounds?q=${query}`;
    const html = await this.fetchHtml(searchUrl);
    const items = collectSearchHydration(html);
    const candidates = items
      .map((it) => toCandidate(it))
      .filter((c): c is AudiusCandidate & { permalink: string } => c !== null);
    const match = pickBestMatch(snapshot, candidates);
    if (!match) return null;
    const winner = candidates.find((c) => c.id === match.sourceTrackId);
    if (!winner) return null;
    return { sourceTrackId: winner.id, sourceLocator: winner.permalink };
  }

  async produceStreamUrl(sourceLocator: string): Promise<SoundCloudStreamUrlResult | null> {
    const html = await this.fetchHtml(sourceLocator);
    const parsed = extractSourceFromHtml(html);
    if (!parsed) return null;
    const transcoding = parsed.transcodings.find((t) => t.protocol === "progressive");
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
    const expiresAt = new Date(Date.now() + STREAM_LIFETIME_MS).toISOString();
    return { streamUrl, expiresAt };
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
