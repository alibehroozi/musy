import { Injectable, Logger, Inject } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { SongSnapshot } from "@moc/contracts";
import { pickBestMatch, type AudiusCandidate } from "@moc/api-core";

const AUDIUS_BASE = "https://api.audius.co/v1";
const SEARCH_LIMIT = 5;

export interface AudiusFindResult {
  sourceTrackId: string;
  sourceLocator: string;
}

export interface AudiusStreamUrlResult {
  streamUrl: string;
  expiresAt: string | null;
}

@Injectable()
export class AudiusStreamClient {
  private readonly logger = new Logger(AudiusStreamClient.name);
  private readonly appName: string;

  constructor(@Inject(ConfigService) config: ConfigService) {
    this.appName = config.get<string>("AUDIUS_APP_NAME", "moc");
  }

  async findMatch(snapshot: SongSnapshot): Promise<AudiusFindResult | null> {
    const url = new URL(`${AUDIUS_BASE}/tracks/search`);
    url.searchParams.set("query", `${snapshot.title} ${snapshot.artist}`.trim());
    url.searchParams.set("app_name", this.appName);
    url.searchParams.set("limit", String(SEARCH_LIMIT));

    const res = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      throw new Error(`Audius responded ${res.status}`);
    }
    const body = (await res.json()) as { data?: unknown[] };
    const items = Array.isArray(body.data) ? body.data : [];
    const candidates = items
      .map((raw) => toCandidate(raw))
      .filter((c): c is AudiusCandidate => c !== null);
    const match = pickBestMatch(snapshot, candidates);
    if (!match) return null;
    return {
      sourceTrackId: match.sourceTrackId,
      sourceLocator: match.sourceTrackId,
    };
  }

  produceStreamUrl(sourceLocator: string): AudiusStreamUrlResult {
    // Audius's stream-redirect endpoint returns a 302 to the actual MP3.
    // The URL itself is stable; the 302 target is what expires (handled
    // by Audius CDN). FE plays from this URL directly; expiresAt: null
    // because we don't track the 302 target.
    const url = new URL(`${AUDIUS_BASE}/tracks/${sourceLocator}/stream`);
    url.searchParams.set("app_name", this.appName);
    return { streamUrl: url.toString(), expiresAt: null };
  }
}

function toCandidate(raw: unknown): AudiusCandidate | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { id?: unknown; title?: unknown; user?: { name?: unknown }; duration?: unknown };
  const id = typeof r.id === "string" ? r.id : typeof r.id === "number" ? String(r.id) : "";
  if (!id) return null;
  const title = typeof r.title === "string" ? r.title : "";
  const artist = typeof r.user?.name === "string" ? r.user.name : "";
  const durationSec = typeof r.duration === "number" ? r.duration : 0;
  return { id, title, artist, durationSec };
}
