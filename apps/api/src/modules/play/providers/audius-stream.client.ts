import { Injectable, Logger, Inject } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { SongSnapshot } from "@moc/contracts";
import { pickBestMatch, type RawAudiusTrackResult } from "@moc/api-core";

const AUDIUS_BASE = "https://api.audius.co/v1";
const SEARCH_LIMIT = 5;

@Injectable()
export class AudiusStreamClient {
  private readonly logger = new Logger(AudiusStreamClient.name);
  private readonly appName: string;

  constructor(@Inject(ConfigService) config: ConfigService) {
    this.appName = config.get<string>("AUDIUS_APP_NAME", "moc");
  }

  async resolveTrackId(
    snapshot: Pick<SongSnapshot, "title" | "artist" | "durationSec">,
  ): Promise<string | null> {
    const query = `${snapshot.title} ${snapshot.artist}`;
    const url = new URL(`${AUDIUS_BASE}/tracks/search`);
    url.searchParams.set("query", query);
    url.searchParams.set("app_name", this.appName);
    url.searchParams.set("limit", String(SEARCH_LIMIT));

    const res = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      throw new Error(`Audius search responded ${res.status}`);
    }
    const body = (await res.json()) as { data?: unknown[] };
    const items = Array.isArray(body.data) ? (body.data as RawAudiusTrackResult[]) : [];
    const match = pickBestMatch(snapshot, items);
    return match?.sourceTrackId ?? null;
  }

  getStreamUrl(sourceTrackId: string): string {
    return `${AUDIUS_BASE}/tracks/${sourceTrackId}/stream?app_name=${encodeURIComponent(this.appName)}`;
  }
}
