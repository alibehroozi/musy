import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { v4 as uuidv4 } from "uuid";
import {
  buildColdStartPrompt,
  buildRerankPrompt,
  classifyByListenCount,
  computeSnapshotHash,
  parseColdStartResponse,
  phaseFor,
  pickCoverMatch,
  resolveCoversForQueue,
  seedSnapshots,
  type PromptCandidate,
} from "@moc/api-core";
import type {
  NextResponse,
  QueuePhase,
  SongSnapshot,
  TasteProfile,
  TrackResult,
} from "@moc/contracts";

import { SwipesRepository } from "./explore.repository.js";
import { TasteProfilesRepository } from "./taste-profile.repository.js";
import { ExploreQueueRepository } from "./explore-queue.repository.js";
import { ProfileBuilderService } from "./profile-builder.service.js";
import { AnthropicClient } from "./anthropic.client.js";
import { AudiusClient } from "../search/providers/audius.client.js";
import { SoundCloudClient } from "../search/providers/soundcloud.client.js";
import { SearchService } from "../search/search.service.js";
import { PlayService } from "../play/play.service.js";

const PRE_RESOLVE_TOP_N = 5;
const REFILL_THRESHOLD = 5;
const MAX_COUNT = 50;
const MIN_COUNT = 1;
const DEFAULT_MODEL = "claude-sonnet-4-6";
const RERANK_MAX_TOKENS = 4096;

interface RerankItem {
  title: string;
  artist: string;
  source: string;
  score: number;
}

@Injectable()
export class QueueBuilderService {
  private readonly logger = new Logger(QueueBuilderService.name);

  constructor(
    @Inject(SwipesRepository) private readonly swipes: SwipesRepository,
    @Inject(TasteProfilesRepository)
    private readonly profiles: TasteProfilesRepository,
    @Inject(ExploreQueueRepository)
    private readonly queues: ExploreQueueRepository,
    @Inject(ProfileBuilderService)
    private readonly profileBuilder: ProfileBuilderService,
    @Inject(AnthropicClient) private readonly anthropic: AnthropicClient,
    @Inject(AudiusClient) private readonly audius: AudiusClient,
    @Inject(SoundCloudClient) private readonly soundcloud: SoundCloudClient,
    @Inject(SearchService) private readonly search: SearchService,
    @Inject(PlayService) private readonly play: PlayService,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  /**
   * Top-level read for `GET /api/explore/next`. Returns the user's
   * current queue, building one if no queue exists yet. The build is
   * synchronous on first hit so the response is never `partial: true`
   * for the empty-queue case (the seed-genre Phase 1 path is local).
   *
   * `count` is clamped to [MIN_COUNT, MAX_COUNT]; the response carries
   * the top `count` items of the queue.
   */
  async getNext(userId: string, count: number): Promise<NextResponse> {
    const safeCount = Math.max(MIN_COUNT, Math.min(MAX_COUNT, Math.floor(count)));
    let queue = await this.queues.findForUser(userId);
    if (!queue) {
      await this.rebuildQueue(userId);
      queue = await this.queues.findForUser(userId);
    }
    if (!queue) {
      // Best-effort fallback — a build that produced nothing still
      // surfaces the seed-genre snapshots so the UI is never empty.
      // API-17 filter: seeds without coverUrl never reach the wire.
      const seeds = seedSnapshots().filter(hasNonEmptyCover).slice(0, safeCount);
      return { items: seeds, phase: "discovery", partial: true };
    }

    // Always exclude songs the user has already swiped so they never
    // reappear — even when the stored queue pre-dates the latest swipes.
    // API-17 defense-in-depth: also drop any item without coverUrl. The
    // queue builder's resolution step (rebuildQueue) is the primary
    // enforcement; this filter catches pre-existing rows from before
    // DATA-13 landed and any future drift.
    const swipeDocs = await this.swipes.findSwipesForUser(userId);
    const seenHashes = new Set(swipeDocs.map((s) => s.snapshotHash));
    const filtered = queue.items.filter(
      (item) => !seenHashes.has(computeSnapshotHash(item)) && hasNonEmptyCover(item),
    );
    shuffleInPlace(filtered);

    const items = filtered.slice(0, safeCount);
    return {
      items,
      phase: queue.phase,
      partial: items.length < safeCount,
    };
  }

  /**
   * Force-rebuild the queue. Per spec, this is also fired by the swipe
   * handler when the queue dips below REFILL_THRESHOLD items.
   */
  async rebuildQueue(userId: string): Promise<void> {
    this.logger.log(
      { event: "explore_queue_rebuild_started", userId },
      "explore_queue_rebuild_started",
    );

    const swipeDocs = await this.swipes.findSwipesForUser(userId);
    const profile = await this.profileBuilder.getProfile(userId);
    const phase = phaseFor(profile, swipeDocs.length);

    const seenHashes = new Set(swipeDocs.map((s) => s.snapshotHash));
    let items: SongSnapshot[];
    try {
      items = await this.sourceCandidates(phase, profile, seenHashes);
    } catch (err) {
      this.logger.warn(
        {
          event: "explore_queue_source_failed",
          userId,
          err: errToString(err),
        },
        "explore_queue_source_failed",
      );
      items = seedSnapshots().filter((s) => !seenHashes.has(computeSnapshotHash(s)));
    }

    // DATA-13: any candidate that didn't pick up a coverUrl during
    // sourcing gets one resolved here via the unified search aggregator.
    // Candidates the aggregator can't cover are dropped: a song with no
    // resolvable artwork "doesn't exist" by the explore queue's contract.
    items = await this.resolveCoversForCandidates(items);

    if (items.length === 0) {
      this.logger.warn(
        { event: "explore_queue_rebuild_empty", userId },
        "explore_queue_rebuild_empty",
      );
      return;
    }

    await this.queues.upsertForUser({
      id: uuidv4(),
      userId,
      items,
      phase,
      generatedAt: new Date(),
      swipesSeenAtBuild: swipeDocs.length,
    });

    // Pre-resolve in parallel; failures are logged but don't block the queue.
    await Promise.allSettled(
      items.slice(0, PRE_RESOLVE_TOP_N).map((s) =>
        this.play.resolve(s).catch((err: unknown) => {
          this.logger.warn(
            {
              event: "explore_queue_preresolve_failed",
              userId,
              err: errToString(err),
            },
            "explore_queue_preresolve_failed",
          );
          return null;
        }),
      ),
    );

    this.logger.log(
      { event: "explore_queue_rebuild_completed", userId, phase, size: items.length },
      "explore_queue_rebuild_completed",
    );
  }

  /**
   * Refill trigger: called by the swipe handler. If the queue is short,
   * fire-and-forget a rebuild. Caller does not await.
   */
  async maybeRefill(userId: string): Promise<void> {
    const queue = await this.queues.findForUser(userId);
    const length = queue?.items.length ?? 0;
    if (length >= REFILL_THRESHOLD) return;
    this.logger.log(
      { event: "explore_queue_refill_triggered", userId, length },
      "explore_queue_refill_triggered",
    );
    void this.rebuildQueue(userId).catch((err: unknown) => {
      this.logger.error(
        { event: "explore_queue_refill_failed", userId, err: errToString(err) },
        "explore_queue_refill_failed",
      );
    });
  }

  /**
   * Resolve covers for any candidate that didn't pick one up during
   * the per-phase sourcing step. Each uncovered candidate is queried
   * against the unified `SearchService` aggregator (broader provider
   * fan-out than the per-phase Audius/SoundCloud lookups — adds
   * Deezer + Genius + RadioBrowser); the first track with a non-empty
   * `artworkUrl` becomes that candidate's `coverUrl`. Candidates with
   * no resolvable artwork are dropped.
   *
   * The pure helper `resolveCoversForQueue` from `@moc/api-core` does
   * the actual filtering — this method just resolves the lookups in
   * parallel and hands them to the helper as a sync function.
   */
  private async resolveCoversForCandidates(candidates: SongSnapshot[]): Promise<SongSnapshot[]> {
    if (candidates.length === 0) return candidates;
    const uncovered = candidates.filter((c) => !hasNonEmptyCover(c));
    if (uncovered.length === 0) return [...candidates];

    const settled = await Promise.allSettled(
      uncovered.map((c) =>
        this.search
          .search(`${c.title} ${c.artist}`)
          .then((response) => pickCoverMatch(c.title, c.artist, response.results)),
      ),
    );

    const lookupMap = new Map<string, TrackResult | null>();
    uncovered.forEach((c, idx) => {
      const result = settled[idx];
      const key = lookupKey(c.title, c.artist);
      if (result === undefined || result.status === "rejected") {
        if (result?.status === "rejected") {
          this.logger.warn(
            {
              event: "explore_cover_lookup_failed",
              title: c.title,
              artist: c.artist,
              err: errToString(result.reason),
            },
            "explore_cover_lookup_failed",
          );
        }
        lookupMap.set(key, null);
        return;
      }
      lookupMap.set(key, result.value);
    });

    return resolveCoversForQueue(
      candidates,
      (title, artist) => lookupMap.get(lookupKey(title, artist)) ?? null,
    );
  }

  private async sourceCandidates(
    phase: QueuePhase,
    profile: TasteProfile | null,
    seenHashes: Set<string>,
  ): Promise<SongSnapshot[]> {
    if (phase === "discovery") {
      return await this.sourceDiscovery(seenHashes);
    }

    if (phase === "artist-refinement") {
      return await this.sourceArtistRefinement(profile, seenHashes);
    }

    return await this.sourcePersonalized(profile, seenHashes);
  }

  /**
   * Discovery phase: ask Claude to generate a diverse initial set of songs,
   * then look each up on Audius/SoundCloud to enrich with cover art and
   * duration. Falls back to the static seed list if AI or providers fail.
   */
  private async sourceDiscovery(seenHashes: Set<string>): Promise<SongSnapshot[]> {
    try {
      const { system, userMessage } = buildColdStartPrompt();
      const model = this.config.get<string>("ANTHROPIC_MODEL") ?? DEFAULT_MODEL;
      const response = await this.anthropic.complete({
        system,
        userMessage,
        model,
        maxTokens: 1024,
      });
      const suggestions = parseColdStartResponse(response.text);
      if (suggestions.length === 0) throw new Error("cold-start: empty response");

      // Look up each suggestion on providers in parallel to get cover art.
      const settled = await Promise.allSettled(
        suggestions.map(async ({ title, artist }) => {
          const query = `${title} ${artist}`;
          const [audiusResult, scResult] = await Promise.allSettled([
            this.audius.search(query).catch(() => [] as TrackResult[]),
            this.soundcloud.search(query).catch(() => [] as TrackResult[]),
          ]);
          const tracks = combineFulfilled(audiusResult, scResult);
          const match = findBestMatch(title, artist, tracks);
          return match
            ? toSnapshot(match)
            : ({ title, artist, kind: "track" } satisfies SongSnapshot);
        }),
      );

      const enriched = settled
        .filter((r): r is PromiseFulfilledResult<SongSnapshot> => r.status === "fulfilled")
        .map((r) => r.value);

      const result = dedupeBySnapshotHash(enriched, seenHashes);
      if (result.length > 0) return result;
    } catch (err) {
      this.logger.warn(
        { event: "explore_cold_start_failed", err: errToString(err) },
        "explore_cold_start_failed",
      );
    }
    // Fallback: static seed list (no cover art, but always available).
    return seedSnapshots().filter((s) => !seenHashes.has(computeSnapshotHash(s)));
  }

  private async sourceArtistRefinement(
    profile: TasteProfile | null,
    seenHashes: Set<string>,
  ): Promise<SongSnapshot[]> {
    if (!profile) return [];
    const topGenres = profile.genres.slice(0, 3).map((g) => g.name);
    const out: SongSnapshot[] = [];
    for (const genre of topGenres) {
      const [audius, sc] = await Promise.allSettled([
        this.audius.search(genre).catch(() => [] as TrackResult[]),
        this.soundcloud.search(genre).catch(() => [] as TrackResult[]),
      ]);
      const tracks = combineFulfilled(audius, sc);
      const { common, niche } = splitByPopularity(tracks);
      if (common[0]) out.push(toSnapshot(common[0]));
      if (niche[0]) out.push(toSnapshot(niche[0]));
      if (niche[1]) out.push(toSnapshot(niche[1]));
    }
    return dedupeBySnapshotHash(out, seenHashes);
  }

  private async sourcePersonalized(
    profile: TasteProfile | null,
    seenHashes: Set<string>,
  ): Promise<SongSnapshot[]> {
    if (!profile) return [];
    const topArtists = profile.artists.slice(0, 5).map((a) => a.name);
    const topGenres = profile.genres.slice(0, 3).map((g) => g.name);
    const queries = [...topArtists, ...topGenres];

    const settled = await Promise.allSettled(
      queries.flatMap((q) => [
        this.audius.search(q).catch(() => [] as TrackResult[]),
        this.soundcloud.search(q).catch(() => [] as TrackResult[]),
      ]),
    );
    const pool = settled
      .filter((r): r is PromiseFulfilledResult<TrackResult[]> => r.status === "fulfilled")
      .flatMap((r) => r.value);
    const dedupedPool = dedupeBySnapshotHash(pool.map(toSnapshot), seenHashes);
    if (dedupedPool.length === 0) return [];

    // Rerank via LLM. Failure → fall through to heuristic top-N (the
    // pool order itself, after dedupe).
    const candidatePool: PromptCandidate[] = dedupedPool.slice(0, 50).map((s, idx) => ({
      title: s.title,
      artist: s.artist,
      source: pool[idx]?.provider ?? "audius",
    }));
    const { system, userMessage } = buildRerankPrompt({
      candidatePool,
      profileSummary: profile.summaryText,
    });

    let ranked: RerankItem[] | null = null;
    try {
      const model = this.config.get<string>("ANTHROPIC_MODEL") ?? DEFAULT_MODEL;
      const response = await this.anthropic.complete({
        system,
        userMessage,
        model,
        maxTokens: RERANK_MAX_TOKENS,
      });
      ranked = parseRerankResponse(response.text);
    } catch (err) {
      this.logger.warn(
        { event: "explore_queue_rerank_failed", err: errToString(err) },
        "explore_queue_rerank_failed",
      );
    }

    if (ranked && ranked.length > 0) {
      const byKey = new Map(dedupedPool.map((s) => [`${s.title}::${s.artist}`, s]));
      const ordered: SongSnapshot[] = [];
      for (const r of ranked) {
        const key = `${r.title}::${r.artist}`;
        const snap = byKey.get(key);
        if (snap) ordered.push(snap);
      }
      // Backfill anything the model dropped so we never lose candidates.
      for (const snap of dedupedPool) {
        if (!ordered.find((o) => o.title === snap.title && o.artist === snap.artist)) {
          ordered.push(snap);
        }
      }
      return ordered;
    }

    return dedupedPool;
  }
}

/**
 * Find the track whose title+artist best match the AI suggestion. If an
 * exact normalized match exists, prefer it; otherwise take the first result
 * (the search query already biases toward relevance).
 */
function findBestMatch(title: string, artist: string, tracks: TrackResult[]): TrackResult | null {
  if (tracks.length === 0) return null;
  const normTitle = title.trim().toLowerCase();
  const normArtist = artist.trim().toLowerCase();
  const exact = tracks.find(
    (t) =>
      t.title.trim().toLowerCase() === normTitle && t.artist.trim().toLowerCase() === normArtist,
  );
  return exact ?? tracks[0] ?? null;
}

function toSnapshot(track: TrackResult): SongSnapshot {
  return {
    title: track.title,
    artist: track.artist,
    kind: "track",
    ...(track.artworkUrl !== undefined ? { coverUrl: track.artworkUrl } : {}),
    ...(track.duration !== undefined ? { durationSec: track.duration } : {}),
  };
}

function dedupeBySnapshotHash(snapshots: SongSnapshot[], alreadySeen: Set<string>): SongSnapshot[] {
  const seen = new Set<string>(alreadySeen);
  const out: SongSnapshot[] = [];
  for (const s of snapshots) {
    const h = computeSnapshotHash(s);
    if (seen.has(h)) continue;
    seen.add(h);
    out.push(s);
  }
  return out;
}

function combineFulfilled(...settled: PromiseSettledResult<TrackResult[]>[]): TrackResult[] {
  const out: TrackResult[] = [];
  for (const r of settled) {
    if (r.status === "fulfilled") out.push(...r.value);
  }
  return out;
}

interface MaybePopular {
  playback_count?: number;
  play_count?: number;
}

function splitByPopularity(tracks: TrackResult[]): { common: TrackResult[]; niche: TrackResult[] } {
  const common: TrackResult[] = [];
  const niche: TrackResult[] = [];
  for (const t of tracks) {
    const raw = t as unknown as MaybePopular;
    const count = raw.playback_count ?? raw.play_count ?? null;
    const cls = classifyByListenCount(count);
    if (cls === "common") common.push(t);
    else niche.push(t);
  }
  return { common, niche };
}

function parseRerankResponse(text: string): RerankItem[] | null {
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object") return null;
    const ranked = (parsed as { ranked?: unknown }).ranked;
    if (!Array.isArray(ranked)) return null;
    const out: RerankItem[] = [];
    for (const r of ranked) {
      if (!r || typeof r !== "object") continue;
      const item = r as Partial<RerankItem>;
      if (
        typeof item.title === "string" &&
        typeof item.artist === "string" &&
        typeof item.source === "string" &&
        typeof item.score === "number"
      ) {
        out.push({
          title: item.title,
          artist: item.artist,
          source: item.source,
          score: item.score,
        });
      }
    }
    return out;
  } catch {
    return null;
  }
}

function errToString(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  return String(err);
}

function hasNonEmptyCover(snap: SongSnapshot): boolean {
  return typeof snap.coverUrl === "string" && snap.coverUrl.length > 0;
}

function lookupKey(title: string, artist: string): string {
  return `${title}::${artist}`;
}

function shuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
}
