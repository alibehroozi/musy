import { Injectable, Logger } from "@nestjs/common";
import type { TrackResult } from "@moc/contracts";
import { normalizeDeezerTrack, type RawDeezerTrack } from "@moc/api-core";

const DEEZER_BASE = "https://api.deezer.com";
const LIMIT = 10;

@Injectable()
export class DeezerClient {
  private readonly logger = new Logger(DeezerClient.name);

  async search(query: string): Promise<TrackResult[]> {
    const url = new URL(`${DEEZER_BASE}/search`);
    url.searchParams.set("q", query);
    url.searchParams.set("limit", String(LIMIT));

    const res = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      throw new Error(`Deezer responded ${res.status}`);
    }
    const body = (await res.json()) as { data?: unknown[] };
    const items = Array.isArray(body.data) ? body.data : [];
    return items
      .map((item) => normalizeDeezerTrack(item as RawDeezerTrack))
      .filter((r): r is TrackResult => r !== null);
  }
}
