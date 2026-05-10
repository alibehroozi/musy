import { Injectable, Logger, Inject } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { TrackResult } from "@moc/contracts";
import {
  extractClientId,
  normalizeSoundCloudSearchHit,
  type RawSoundCloudSearchHit,
} from "@moc/api-core";

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const SEARCH_PAGE_BASE = "https://soundcloud.com/search/sounds";
const SEARCH_API = "https://api-v2.soundcloud.com/search/tracks";
const LIMIT = 10;

interface RawSearchEnvelope {
  collection?: unknown[];
}

@Injectable()
export class SoundCloudClient {
  private readonly logger = new Logger(SoundCloudClient.name);
  private readonly userAgent: string;

  // Cached across calls — the client_id is stable for hours and re-fetching the
  // search page on every call would double the egress per query for no benefit.
  // Re-extracted opportunistically when the current id stops working.
  private cachedClientId: string | null = null;

  constructor(@Inject(ConfigService) config: ConfigService) {
    this.userAgent = config.get<string>("SOUNDCLOUD_USER_AGENT", DEFAULT_USER_AGENT);
  }

  async search(query: string): Promise<TrackResult[]> {
    const html = await this.fetchSearchPageHtml(query);
    const freshClientId = extractClientId(html);
    if (freshClientId) this.cachedClientId = freshClientId;

    const clientId = this.cachedClientId;
    let hits: RawSoundCloudSearchHit[] = [];
    if (clientId) {
      hits = await this.fetchSearchApi(query, clientId);
    }
    if (hits.length === 0) {
      hits = collectSearchHydration(html);
    }
    return hits
      .map((hit) => normalizeSoundCloudSearchHit(hit))
      .filter((r): r is TrackResult => r !== null)
      .slice(0, LIMIT);
  }

  private async fetchSearchPageHtml(query: string): Promise<string> {
    const url = `${SEARCH_PAGE_BASE}?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: { Accept: "text/html", "User-Agent": this.userAgent },
    });
    if (!res.ok) throw new Error(`SoundCloud search page responded ${res.status}`);
    return await res.text();
  }

  private async fetchSearchApi(query: string, clientId: string): Promise<RawSoundCloudSearchHit[]> {
    const url = new URL(SEARCH_API);
    url.searchParams.set("q", query);
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("limit", String(LIMIT));
    const res = await fetch(url.toString(), {
      headers: { Accept: "application/json", "User-Agent": this.userAgent },
    });
    if (!res.ok) {
      // Don't surface the SC-side body — it has previously echoed the spoofed UA back.
      throw new Error(`SoundCloud search API responded ${res.status}`);
    }
    const body = (await res.json()) as RawSearchEnvelope;
    return Array.isArray(body.collection) ? (body.collection as RawSoundCloudSearchHit[]) : [];
  }
}

const HYDRATION_RE = /window\.__sc_hydration\s*=\s*(\[[\s\S]*?\]);/;

function collectSearchHydration(html: string): RawSoundCloudSearchHit[] {
  const match = HYDRATION_RE.exec(html);
  if (!match || typeof match[1] !== "string") return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(match[1]);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const tracks: RawSoundCloudSearchHit[] = [];
  for (const entry of parsed as Array<{ hydratable?: unknown; data?: unknown }>) {
    if (entry.hydratable === "search" && entry.data && typeof entry.data === "object") {
      const collection = (entry.data as { collection?: unknown }).collection;
      if (Array.isArray(collection)) {
        for (const item of collection) {
          if (item && typeof item === "object" && (item as { kind?: unknown }).kind === "track") {
            tracks.push(item as RawSoundCloudSearchHit);
          }
        }
      }
    }
  }
  return tracks;
}
