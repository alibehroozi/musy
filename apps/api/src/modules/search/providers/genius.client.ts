import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { TrackResult } from "@moc/contracts";
import { normalizeGeniusHit, type RawGeniusHit } from "@moc/api-core";

const GENIUS_BASE = "https://api.genius.com";
const LIMIT = 10;

@Injectable()
export class GeniusClient {
  private readonly logger = new Logger(GeniusClient.name);
  private readonly accessToken: string;

  constructor(config: ConfigService) {
    // Fail fast at startup if the token is absent — search will be broken otherwise
    this.accessToken = config.getOrThrow<string>("GENIUS_ACCESS_TOKEN");
  }

  async search(query: string): Promise<TrackResult[]> {
    const url = new URL(`${GENIUS_BASE}/search`);
    url.searchParams.set("q", query);
    url.searchParams.set("per_page", String(LIMIT));

    const res = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${this.accessToken}`,
      },
    });
    if (!res.ok) {
      throw new Error(`Genius responded ${res.status}`);
    }
    const body = (await res.json()) as {
      response?: { hits?: unknown[] };
    };
    const hits = Array.isArray(body.response?.hits) ? (body.response.hits as unknown[]) : [];
    return hits
      .map((hit) => normalizeGeniusHit(hit as RawGeniusHit))
      .filter((r): r is TrackResult => r !== null);
  }
}
