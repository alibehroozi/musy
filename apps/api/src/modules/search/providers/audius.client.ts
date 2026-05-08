import { Injectable, Logger, Inject } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { TrackResult } from "@moc/contracts";
import { normalizeAudiusTrack, type RawAudiusTrack } from "@moc/api-core";

const AUDIUS_BASE = "https://api.audius.co/v1";
const LIMIT = 10;

@Injectable()
export class AudiusClient {
  private readonly logger = new Logger(AudiusClient.name);
  private readonly appName: string;

  constructor(@Inject(ConfigService) config: ConfigService) {
    this.appName = config.get<string>("AUDIUS_APP_NAME", "moc");
  }

  async search(query: string): Promise<TrackResult[]> {
    const url = new URL(`${AUDIUS_BASE}/tracks/search`);
    url.searchParams.set("query", query);
    url.searchParams.set("app_name", this.appName);
    url.searchParams.set("limit", String(LIMIT));

    const res = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      throw new Error(`Audius responded ${res.status}`);
    }
    const body = (await res.json()) as { data?: unknown[] };
    const items = Array.isArray(body.data) ? body.data : [];
    return items
      .map((item) => normalizeAudiusTrack(item as RawAudiusTrack))
      .filter((r): r is TrackResult => r !== null);
  }
}
