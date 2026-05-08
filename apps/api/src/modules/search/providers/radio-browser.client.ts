import { Injectable, Logger } from "@nestjs/common";
import type { StationResult } from "@moc/contracts";
import { normalizeRadioBrowserStation, type RawRadioBrowserStation } from "@moc/api-core";

// One of the stable Radio Browser community servers
const RADIO_BROWSER_BASE = "https://de1.api.radio-browser.info";
const LIMIT = 10;

@Injectable()
export class RadioBrowserClient {
  private readonly logger = new Logger(RadioBrowserClient.name);

  async search(query: string): Promise<StationResult[]> {
    const url = new URL(`${RADIO_BROWSER_BASE}/json/stations/search`);
    url.searchParams.set("name", query);
    url.searchParams.set("limit", String(LIMIT));
    url.searchParams.set("hidebroken", "true");
    url.searchParams.set("order", "clickcount");
    url.searchParams.set("reverse", "true");

    const res = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        "User-Agent": "moc/1.0",
      },
    });
    if (!res.ok) {
      throw new Error(`Radio Browser responded ${res.status}`);
    }
    const items = (await res.json()) as unknown[];
    return (Array.isArray(items) ? items : [])
      .map((item) => normalizeRadioBrowserStation(item as RawRadioBrowserStation))
      .filter((r): r is StationResult => r !== null);
  }
}
