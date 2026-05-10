import { Injectable, Logger, Inject } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { SongSnapshot } from "@moc/contracts";
import {
  extractSourceFromHtml,
  extractClientId,
  isPlayableTranscoding,
  pickBestMatch,
  type AudiusCandidate,
} from "@moc/api-core";

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const STREAM_LIFETIME_MS = 55 * 60 * 1000;

// Stable across pages for a given SoundCloud session; updated on every page fetch.
// Using a class-level cache avoids re-extracting on every produceStreamUrl call and
// provides a fallback when a specific track page hides the clientId.
let sharedClientId: string | null = null;

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
    if (clientId) sharedClientId = clientId;

    const primaryItems: RawSearchTrack[] = clientId
      ? await this.fetchSearchItems(query, clientId, 20)
      : collectSearchHydration(html);

    // Phase 1: verify the best strict (title+artist) match yields a playable
    // (non-snipped, non-DRM) stream. SoundCloud search results omit media.transcodings,
    // so we use the resolve API (a lightweight JSON call) to inspect the track's
    // protocols and probe the transcoding endpoint.
    const strictBest = this.pickFromItems(snapshot, primaryItems);
    if (strictBest && clientId) {
      if (await this.canStreamPlayable(strictBest.sourceLocator, clientId)) return strictBest;
    }

    // Phase 2: title-only broader search — finds remixes/covers/user-uploads with
    // playable transcodings when the best strict match is snippet-gated or DRM-only
    // (e.g. major-label SoundCloud-Go content).
    if (clientId && snapshot.title) {
      const titleItems = await this.fetchSearchItems(snapshot.title, clientId, 20);
      const titleCandidates = titleItems
        .map(toCandidate)
        .filter((c): c is AudiusCandidate & { permalink: string } => c !== null);

      // Check candidates in parallel batches of 4 to keep latency manageable.
      for (let i = 0; i < Math.min(titleCandidates.length, 16); i += 4) {
        const batch = titleCandidates.slice(i, i + 4);
        const results = await Promise.all(
          batch.map((c) =>
            this.canStreamPlayable(c.permalink, clientId).then((ok) => (ok ? c : null)),
          ),
        );
        const winner = results.find((r) => r !== null);
        if (winner) return { sourceTrackId: winner.id, sourceLocator: winner.permalink };
      }
    }

    // Phase 3: last resort — return the best strict match. Downstream
    // produceStreamUrl will still refuse to hand back a DRM URL, so the resolver
    // gracefully degrades to streamUrl: null if even this candidate is unplayable.
    return strictBest;
  }

  async produceStreamUrl(sourceLocator: string): Promise<SoundCloudStreamUrlResult | null> {
    const html = await this.fetchHtml(sourceLocator);
    const freshClientId = extractClientId(html);
    if (freshClientId) sharedClientId = freshClientId;

    const parsed = extractSourceFromHtml(html);
    if (parsed) {
      const result = await this.streamFromParsed(parsed);
      if (result) return result;
    }

    // Use the freshly extracted clientId or fall back to the one cached by findMatch.
    // Some track pages embed the clientId differently than the search page does.
    const clientId = freshClientId ?? sharedClientId;
    if (!clientId) return null;
    return await this.streamViaResolveApi(sourceLocator, clientId);
  }

  // ── private helpers ──────────────────────────────────────────────────────────

  private async fetchSearchItems(
    query: string,
    clientId: string,
    limit = 20,
  ): Promise<RawSearchTrack[]> {
    const url = new URL("https://api-v2.soundcloud.com/search/tracks");
    url.searchParams.set("q", query);
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("limit", String(limit));
    try {
      const res = await fetch(url.toString(), {
        headers: { Accept: "application/json", "User-Agent": this.userAgent },
      });
      if (!res.ok) return [];
      const body = (await res.json()) as { collection?: unknown[] };
      return Array.isArray(body.collection) ? (body.collection as RawSearchTrack[]) : [];
    } catch {
      return [];
    }
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

  // Verifies that a SoundCloud track at `permalink` can actually produce a playable
  // stream URL: non-snipped, non-DRM (no FairPlay/Widevine), and not a preview
  // response. Uses the resolve API to get transcodings, filters with
  // isPlayableTranscoding (closed allowlist of progressive/hls), then probes the
  // transcoding endpoint to confirm the URL is real (SoundCloud advertises
  // transcodings it won't actually serve to anonymous users).
  private async canStreamPlayable(permalink: string, clientId: string): Promise<boolean> {
    try {
      const resolveUrl = new URL("https://api-v2.soundcloud.com/resolve");
      resolveUrl.searchParams.set("url", permalink);
      resolveUrl.searchParams.set("client_id", clientId);
      const res = await fetch(resolveUrl.toString(), {
        headers: { Accept: "application/json", "User-Agent": this.userAgent },
      });
      if (!res.ok) return false;

      type RawT = { url?: string; format?: { protocol?: string }; snipped?: boolean };
      type Track = { media?: { transcodings?: RawT[] } };
      const track = (await res.json()) as Track;
      const transcodings = track.media?.transcodings ?? [];

      const playable = transcodings.filter((t) => {
        if (typeof t.url !== "string" || t.url.length === 0) return false;
        const protocol = t.format?.protocol;
        if (typeof protocol !== "string") return false;
        return isPlayableTranscoding({ protocol, snipped: t.snipped === true });
      });
      // Prefer progressive (mp3, smallest playback overhead); fall back to plain HLS.
      const candidate = playable.find((t) => t.format?.protocol === "progressive") ?? playable[0];
      if (!candidate?.url) return false;

      // Probe the transcoding endpoint — SoundCloud lists transcodings it won't
      // actually serve to anonymous users (404), so the listing alone is not
      // sufficient evidence of playability.
      const transcodingUrl = new URL(candidate.url);
      transcodingUrl.searchParams.set("client_id", clientId);
      const streamRes = await fetch(transcodingUrl.toString(), {
        headers: { Accept: "application/json", "User-Agent": this.userAgent },
      });
      if (!streamRes.ok) return false;
      const streamBody = (await streamRes.json()) as { url?: unknown };
      const streamUrl = typeof streamBody.url === "string" ? streamBody.url : "";
      return streamUrl.length > 0 && !streamUrl.includes("/preview/");
    } catch {
      return false;
    }
  }

  private async streamFromParsed(
    parsed: ReturnType<typeof extractSourceFromHtml>,
  ): Promise<SoundCloudStreamUrlResult | null> {
    if (!parsed) return null;
    // Closed allowlist via isPlayableTranscoding: only non-snipped progressive/hls.
    // Never return a snipped/preview transcoding, and never an encrypted variant
    // (cbc-encrypted-hls / ctr-encrypted-hls) — those need FairPlay/Widevine EME
    // which we don't implement. Prefer progressive over plain HLS.
    const playable = parsed.transcodings.filter(isPlayableTranscoding);
    const transcoding = playable.find((t) => t.protocol === "progressive") ?? playable[0];
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
      const transcodings = Array.isArray(track.media?.transcodings) ? track.media.transcodings : [];
      // Closed allowlist via isPlayableTranscoding: only non-snipped progressive/hls;
      // encrypted variants (cbc-encrypted-hls / ctr-encrypted-hls) are excluded.
      const playable = transcodings.filter((t) => {
        if (typeof t.url !== "string" || t.url.length === 0) return false;
        const protocol = t.format?.protocol;
        if (typeof protocol !== "string") return false;
        return isPlayableTranscoding({ protocol, snipped: t.snipped === true });
      });
      const candidate = playable.find((t) => t.format?.protocol === "progressive") ?? playable[0];
      if (!candidate?.url) return null;

      const transcodingUrl = new URL(candidate.url);
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
