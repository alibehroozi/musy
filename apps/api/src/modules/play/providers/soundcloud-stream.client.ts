import { Injectable, Logger, Inject } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { SongSnapshot } from "@moc/contracts";
import { extractSourceFromHtml } from "@moc/api-core";

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

const SOUNDCLOUD_SEARCH_BASE = "https://soundcloud.com/search/sounds";

@Injectable()
export class SoundCloudStreamClient {
  private readonly logger = new Logger(SoundCloudStreamClient.name);
  private readonly userAgent: string;

  constructor(@Inject(ConfigService) config: ConfigService) {
    this.userAgent = config.get<string>("SOUNDCLOUD_USER_AGENT", DEFAULT_USER_AGENT);
  }

  async resolveStreamUrl(
    snapshot: Pick<SongSnapshot, "title" | "artist">,
  ): Promise<{ sourceTrackId: string; streamUrl: string } | null> {
    const query = encodeURIComponent(`${snapshot.title} ${snapshot.artist}`);
    const searchUrl = `${SOUNDCLOUD_SEARCH_BASE}?q=${query}`;

    // Fetch the SoundCloud search page to find the first matching track URL
    const searchRes = await fetch(searchUrl, {
      headers: { "User-Agent": this.userAgent, Accept: "text/html" },
    });
    if (!searchRes.ok) {
      throw new Error(`SoundCloud search page responded ${searchRes.status}`);
    }
    const searchHtml = await searchRes.text();

    // Extract the first track href from the HTML
    const trackPath = extractFirstTrackPath(searchHtml);
    if (!trackPath) return null;

    const trackUrl = `https://soundcloud.com${trackPath}`;
    return this.fetchTrackPage(trackUrl);
  }

  async fetchTrackPage(
    trackUrl: string,
  ): Promise<{ sourceTrackId: string; streamUrl: string } | null> {
    const res = await fetch(trackUrl, {
      headers: { "User-Agent": this.userAgent, Accept: "text/html" },
    });
    if (!res.ok) return null;
    const html = await res.text();

    const source = extractSourceFromHtml(html);
    if (!source) return null;

    // Pick the HLS progressive transcoding URL (preferred for streaming)
    const transcoding =
      source.transcodings.find(
        (t) => t.format.protocol === "progressive" && t.format.mime_type.includes("mpeg"),
      ) ?? source.transcodings[0];

    if (!transcoding) return null;

    // Resolve the transcoding URL to a real stream URL
    const resolvedUrl = await this.resolveTranscodingUrl(transcoding.url, source.clientId);
    if (!resolvedUrl) return null;

    return { sourceTrackId: source.sourceTrackId, streamUrl: resolvedUrl };
  }

  private async resolveTranscodingUrl(
    transcodingUrl: string,
    clientId: string,
  ): Promise<string | null> {
    const url = new URL(transcodingUrl);
    url.searchParams.set("client_id", clientId);

    const res = await fetch(url.toString(), {
      headers: { "User-Agent": this.userAgent },
    });
    if (!res.ok) return null;

    const body = (await res.json()) as { url?: string };
    return body.url ?? null;
  }
}

function extractFirstTrackPath(html: string): string | null {
  // Look for a link matching /username/trackname pattern in the search results
  const match = /href="(\/[^"]+\/[^"?#]+)"[^>]*>/.exec(html);
  return match?.[1] ?? null;
}
