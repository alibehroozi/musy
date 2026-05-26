import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { v4 as uuidv4 } from "uuid";
import {
  applyPerArtistCap,
  buildDiscoveryScenesPrompt,
  buildRelatedArtistsPrompt,
  buildTasteDrivenPickPrompt,
  collectAsymmetricExcludedHashes,
  computeSnapshotHash,
  DISCOVERY_SCENES_MAX_RECENT_SWIPES,
  paginateUnseenBySkip,
  parseDiscoveryScenesResponse,
  parseRelatedArtistsResponse,
  parseTasteDrivenPickResponse,
  phaseFor,
  pickCoverMatch,
  RELATED_ARTISTS_HIGH_BUCKET_SAMPLE_CAP,
  resolveCoversForQueue,
  seedSnapshots,
  slotFor,
  softSuppressedArtists,
  STRONG_ARTIST_SCORE_THRESHOLD,
  SWIPE_TRIGGER_THRESHOLD,
  TASTE_DRIVEN_PICKS_TARGET,
  type AsymmetricSwipe,
  type DiscoveryScenesSwipe,
  type HighBucketSample,
  type SoftSuppressSwipe,
  type TasteDrivenPromptCandidate,
  type TasteDrivenScoreBuckets,
  type TasteDrivenScoreBucketEntry,
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
import { InterestScoresRepository } from "../search/interest-scores.repository.js";
import { PlayService } from "../play/play.service.js";

const PRE_RESOLVE_TOP_N = 5;
const REFILL_THRESHOLD = 5;
const MAX_COUNT = 50;
const MIN_COUNT = 1;
const DEFAULT_MODEL = "claude-sonnet-4-6";

// Taste-driven phase: how many seed artist names from profile.artists are
// shuffled and passed to the related-artists Claude call. Gives variability
// across rebuilds while keeping the seed list recognizable.
const TASTE_DRIVEN_SEED_SHUFFLE_SIZE = 8;
// Fallback when the related-artists Claude call fails: search SoundCloud
// directly for the top N profile artists (same as the old artist-refinement
// pattern for graceful degradation).
const TASTE_DRIVEN_FALLBACK_TOP_ARTISTS = 8;
// Max tokens for the related-artists call (small — just a list of names).
const TASTE_DRIVEN_RELATED_ARTISTS_MAX_TOKENS = 512;
// Max tokens for the final-pick call.
const TASTE_DRIVEN_PICK_MAX_TOKENS = 4096;
// Per the design: 10 random songs from each score bucket reach the prompt.
const SCORE_BUCKET_SAMPLE_SIZE = 10;
const SCORE_BUCKET_LOW = { min: 0, max: 3 };
const SCORE_BUCKET_MID = { min: 4, max: 7 };
const SCORE_BUCKET_HIGH = { min: 8, max: 10 };

@Injectable()
export class QueueBuilderService {
  private readonly logger = new Logger(QueueBuilderService.name);

  // API-21: tracks in-flight rebuilds per user so concurrent calls share
  // a single underlying build (no duplicate LLM round-trips). API-20 reads
  // this map to set the buildingQueue flag on the /next response.
  private readonly inFlightRebuilds = new Map<string, Promise<void>>();

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
    @Inject(InterestScoresRepository)
    private readonly interestScores: InterestScoresRepository,
    @Inject(PlayService) private readonly play: PlayService,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  /**
   * Top-level read for `GET /api/explore/next`.
   *
   * Returns the user's current queue. If the queue is missing or running
   * low (< REFILL_THRESHOLD unseen), fires `rebuildQueue` asynchronously
   * (fire-and-forget) and signals `buildingQueue: true` so the FE can
   * show a loading state and poll without re-triggering rebuilds (UI-23,
   * idempotency via API-21).
   */
  async getNext(userId: string, count: number): Promise<NextResponse> {
    const safeCount = Math.max(MIN_COUNT, Math.min(MAX_COUNT, Math.floor(count)));
    const queue = await this.queues.findForUser(userId);

    if (!queue) {
      this.kickoffRebuild(userId);
      return {
        items: [],
        phase: "discovery",
        partial: true,
        buildingQueue: true,
      };
    }

    const swipeDocs = await this.swipes.findSwipesForUser(userId);
    const excluded = collectAsymmetricExcludedHashes(
      toAsymmetricSwipes(swipeDocs),
      slotFor(new Date()),
    );
    const filtered = applyPerArtistCap(
      queue.items.filter(
        (item) => !excluded.has(computeSnapshotHash(item)) && hasNonEmptyCover(item),
      ),
    );

    if (filtered.length < REFILL_THRESHOLD) {
      this.kickoffRebuild(userId);
    }

    shuffleInPlace(filtered);
    const items = filtered.slice(0, safeCount);
    return {
      items,
      phase: queue.phase,
      partial: items.length < safeCount,
      buildingQueue: this.inFlightRebuilds.has(userId),
    };
  }

  /** Internal: fire a rebuild fire-and-forget. No-op if one is in flight. */
  private kickoffRebuild(userId: string): void {
    if (this.inFlightRebuilds.has(userId)) return;
    void this.rebuildQueue(userId).catch((err: unknown) => {
      this.logger.error(
        { event: "explore_queue_kickoff_failed", userId, err: errToString(err) },
        "explore_queue_kickoff_failed",
      );
    });
  }

  /**
   * Force-rebuild the queue.
   *
   * Idempotent per user (API-21): concurrent invocations for the same
   * userId share one underlying build. The in-flight entry is cleared on
   * settle so the next rebuild cycle starts fresh.
   */
  async rebuildQueue(userId: string): Promise<void> {
    const inFlight = this.inFlightRebuilds.get(userId);
    if (inFlight) return inFlight;

    const promise = this.doRebuild(userId).finally(() => {
      this.inFlightRebuilds.delete(userId);
    });
    this.inFlightRebuilds.set(userId, promise);
    return promise;
  }

  /** The actual rebuild work — wrapped by rebuildQueue for idempotency. */
  private async doRebuild(userId: string): Promise<void> {
    this.logger.log(
      { event: "explore_queue_rebuild_started", userId },
      "explore_queue_rebuild_started",
    );

    const swipeDocs = await this.swipes.findSwipesForUser(userId);
    let profile = await this.profileBuilder.getProfile(userId);

    // API-19: discovery-exit ritual.
    if (profile === null && swipeDocs.length >= SWIPE_TRIGGER_THRESHOLD) {
      await this.profileBuilder.buildIfDue(userId);
      profile = await this.profileBuilder.getProfile(userId);
    }

    const phase = phaseFor(profile, swipeDocs.length);

    const excludedHashes = collectAsymmetricExcludedHashes(
      toAsymmetricSwipes(swipeDocs),
      slotFor(new Date()),
    );
    const suppressedArtists = softSuppressedArtists({
      swipeHistory: toSoftSuppressSwipes(swipeDocs),
    });
    const recentSwipesForScenes: DiscoveryScenesSwipe[] = swipeDocs
      .slice()
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .slice(0, DISCOVERY_SCENES_MAX_RECENT_SWIPES)
      .map((s) => ({
        title: s.snapshot.title,
        artist: s.snapshot.artist,
        direction: s.direction,
      }));

    let items: SongSnapshot[];
    try {
      items = await this.sourceCandidates(
        userId,
        phase,
        profile,
        excludedHashes,
        recentSwipesForScenes,
        toAsymmetricSwipes(swipeDocs),
      );
    } catch (err) {
      this.logger.warn(
        {
          event: "explore_queue_source_failed",
          userId,
          err: errToString(err),
        },
        "explore_queue_source_failed",
      );
      items = seedSnapshots().filter((s) => !excludedHashes.has(computeSnapshotHash(s)));
    }

    items = items.filter((s) => !suppressedArtists.has(s.artist.trim().toLowerCase()));
    items = applyPerArtistCap(items);
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
   * Refill trigger: called by the swipe handler.
   */
  async maybeRefill(userId: string): Promise<void> {
    const queue = await this.queues.findForUser(userId);
    if (!queue) return;

    const swipeDocs = await this.swipes.findSwipesForUser(userId);
    const excluded = collectAsymmetricExcludedHashes(
      toAsymmetricSwipes(swipeDocs),
      slotFor(new Date()),
    );
    const eligible = queue.items.filter((item) => !excluded.has(computeSnapshotHash(item))).length;
    if (eligible >= REFILL_THRESHOLD) return;

    this.logger.log(
      {
        event: "explore_queue_refill_triggered",
        userId,
        eligible,
        raw: queue.items.length,
      },
      "explore_queue_refill_triggered",
    );
    void this.rebuildQueue(userId).catch((err: unknown) => {
      this.logger.error(
        { event: "explore_queue_refill_failed", userId, err: errToString(err) },
        "explore_queue_refill_failed",
      );
    });
  }

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

    const survivors = resolveCoversForQueue(
      candidates,
      (title, artist) => lookupMap.get(lookupKey(title, artist)) ?? null,
    );

    this.logger.log(
      {
        event: "explore_cover_resolution",
        inputCount: candidates.length,
        uncoveredCount: uncovered.length,
        survivorCount: survivors.length,
        droppedCount: candidates.length - survivors.length,
      },
      "explore_cover_resolution",
    );

    return survivors;
  }

  private async sourceCandidates(
    userId: string,
    phase: QueuePhase,
    profile: TasteProfile | null,
    excludedHashes: Set<string>,
    recentSwipesForScenes: DiscoveryScenesSwipe[],
    swipeHistory: AsymmetricSwipe[],
  ): Promise<SongSnapshot[]> {
    if (phase === "discovery") {
      return await this.sourceDiscovery(excludedHashes, recentSwipesForScenes);
    }

    // "personalized" and the legacy stored "artist-refinement" phase both
    // route through sourceTasteDriven (API-33: no new "artist-refinement"
    // documents are written, but old stored ones may still be read).
    return await this.sourceTasteDriven(userId, profile, excludedHashes, swipeHistory);
  }

  /**
   * Discovery phase — API-32 / LOGIC-45..47 / AI-17.
   */
  private async sourceDiscovery(
    excludedHashes: Set<string>,
    recentSwipes: DiscoveryScenesSwipe[],
  ): Promise<SongSnapshot[]> {
    try {
      const { system, userMessage } = buildDiscoveryScenesPrompt({ recentSwipes });
      const model = this.config.get<string>("ANTHROPIC_MODEL") ?? DEFAULT_MODEL;
      const response = await this.anthropic.complete({
        system,
        userMessage,
        model,
        maxTokens: 512,
      });
      const { scenes } = parseDiscoveryScenesResponse(response.text);
      if (scenes.length === 0) throw new Error("discovery-scenes: empty scenes list");

      const settled = await Promise.allSettled(
        scenes.map((scene) => this.soundcloud.search(scene).catch(() => [] as TrackResult[])),
      );

      const allTracks: TrackResult[] = [];
      for (const r of settled) {
        if (r.status === "fulfilled") {
          for (const t of r.value) allTracks.push(t);
        }
      }

      if (allTracks.length === 0) throw new Error("discovery-scenes: all SC searches empty");

      const pool = dedupeBySnapshotHash(
        allTracks.map((t) => toSnapshot(t)),
        excludedHashes,
      );

      if (pool.length > 0) return pool;

      throw new Error("discovery-scenes: all candidates already excluded");
    } catch (err) {
      this.logger.warn(
        { event: "explore_discovery_scenes_failed", err: errToString(err) },
        "explore_discovery_scenes_failed",
      );
    }
    return seedSnapshots().filter((s) => !excludedHashes.has(computeSnapshotHash(s)));
  }

  /**
   * Taste-driven adjacency phase — API-33 / API-34 / LOGIC-48..53 / AI-18..19 / PRIVACY-17.
   *
   * Two-step Claude pattern:
   *   1. Related-artists call: Claude receives profile + high-bucket samples +
   *      shuffled seed artists → returns ~15 adjacent artist names.
   *   2. SoundCloud fan-out: for each adjacent artist, search SC (up to 25
   *      results) and paginate unseen tracks (paginateUnseenBySkip, 3/artist).
   *   3. Final-pick call: Claude receives profile + score buckets + candidate
   *      pool → picks 25 tracks (≤ 2/artist).
   *
   * Fallback when related-artists call fails: search SoundCloud directly for
   * the top TASTE_DRIVEN_FALLBACK_TOP_ARTISTS profile artists (graceful
   * degradation to the old artist-refinement pattern).
   *
   * Fallback when final-pick call fails: return the deduped pool's first 25.
   */
  private async sourceTasteDriven(
    userId: string,
    profile: TasteProfile | null,
    excludedHashes: Set<string>,
    swipeHistory: AsymmetricSwipe[],
  ): Promise<SongSnapshot[]> {
    if (!profile) return [];

    const currentSlot = slotFor(new Date());
    const model = this.config.get<string>("ANTHROPIC_MODEL") ?? DEFAULT_MODEL;

    // Step 1 — Related-artists Claude call.
    let relatedArtists: string[];
    try {
      const highBucketSamples = await this.sampleHighBucketForPrompt(userId);
      const shuffledSeedArtists = shuffleCopy(profile.artists)
        .slice(0, TASTE_DRIVEN_SEED_SHUFFLE_SIZE)
        .map((a) => a.name);

      const { system, userMessage } = buildRelatedArtistsPrompt({
        profile,
        highBucketSamples,
        shuffledSeedArtists,
      });

      const relatedResponse = await this.anthropic.complete({
        system,
        userMessage,
        model,
        maxTokens: TASTE_DRIVEN_RELATED_ARTISTS_MAX_TOKENS,
      });

      const { relatedArtists: parsed } = parseRelatedArtistsResponse(relatedResponse.text);
      if (parsed.length === 0) throw new Error("taste-driven: empty related-artists list");
      relatedArtists = parsed;
    } catch (err) {
      this.logger.warn(
        { event: "explore_taste_driven_related_artists_failed", err: errToString(err) },
        "explore_taste_driven_related_artists_failed",
      );
      // Fallback: search directly for top profile artists (artist-refinement pattern).
      const strongArtists = profile.artists.filter((a) => a.score >= STRONG_ARTIST_SCORE_THRESHOLD);
      const seedArtists = strongArtists.length > 0 ? strongArtists : profile.artists;
      relatedArtists = [...seedArtists]
        .sort((a, b) => b.score - a.score)
        .slice(0, TASTE_DRIVEN_FALLBACK_TOP_ARTISTS)
        .map((a) => a.name);
    }

    // Step 2 — SoundCloud fan-out + paginate-unseen per adjacent artist.
    const settled = await Promise.allSettled(
      relatedArtists.map((artistName) =>
        this.soundcloud.search(artistName).catch(() => [] as TrackResult[]),
      ),
    );

    const paginatedSnapshots: SongSnapshot[] = [];
    for (const result of settled) {
      if (result.status !== "fulfilled") continue;
      const snapshots = result.value.map((t) => toSnapshot(t));
      const unseen = paginateUnseenBySkip({ searchResults: snapshots, swipeHistory, currentSlot });
      for (const s of unseen) paginatedSnapshots.push(s);
    }

    const candidatePool = dedupeBySnapshotHash(paginatedSnapshots, excludedHashes);

    if (candidatePool.length === 0) {
      this.logger.warn(
        { event: "explore_taste_driven_empty_pool" },
        "explore_taste_driven_empty_pool",
      );
      return seedSnapshots().filter((s) => !excludedHashes.has(computeSnapshotHash(s)));
    }

    // Step 3 — Final-pick Claude call.
    const scoreBuckets = await this.sampleAllBucketsForTasteDriven(userId);
    const candidatePoolForPrompt: TasteDrivenPromptCandidate[] = candidatePool.map((s) => ({
      title: s.title,
      artist: s.artist,
      source: "soundcloud" as const,
    }));

    const { system: pickSystem, userMessage: pickMessage } = buildTasteDrivenPickPrompt({
      profile,
      candidatePool: candidatePoolForPrompt,
      scoreBuckets,
    });

    let picks: SongSnapshot[] = [];
    try {
      const pickResponse = await this.anthropic.complete({
        system: pickSystem,
        userMessage: pickMessage,
        model,
        maxTokens: TASTE_DRIVEN_PICK_MAX_TOKENS,
      });

      const { picks: parsedPicks } = parseTasteDrivenPickResponse(pickResponse.text);
      const poolByKey = new Map(candidatePool.map((s) => [lookupKey(s.title, s.artist), s]));
      for (const p of parsedPicks) {
        const snap = poolByKey.get(lookupKey(p.title, p.artist));
        if (snap) picks.push(snap);
      }
    } catch (err) {
      this.logger.warn(
        { event: "explore_taste_driven_pick_failed", err: errToString(err) },
        "explore_taste_driven_pick_failed",
      );
    }

    if (picks.length > 0) return picks;

    // Final-pick fallback: deduped pool's first N (API-34).
    return candidatePool.slice(0, TASTE_DRIVEN_PICKS_TARGET);
  }

  /**
   * Sample up to RELATED_ARTISTS_HIGH_BUCKET_SAMPLE_CAP entries from the
   * high score bucket (score >= 8) for the related-artists prompt (PRIVACY-17).
   * Uses MongoDB's $sample so the selection is random within the bucket —
   * not sorted by score.
   */
  private async sampleHighBucketForPrompt(userId: string): Promise<HighBucketSample[]> {
    const docs = await this.interestScores.sampleByScoreBucket(
      userId,
      SCORE_BUCKET_HIGH.min,
      SCORE_BUCKET_HIGH.max,
      RELATED_ARTISTS_HIGH_BUCKET_SAMPLE_CAP,
    );
    return docs.map((d) => ({ title: d.snapshot.title, artist: d.snapshot.artist }));
  }

  /**
   * Sample score buckets for the taste-driven pick prompt.
   */
  private async sampleAllBucketsForTasteDriven(userId: string): Promise<TasteDrivenScoreBuckets> {
    const [low, mid, high] = await Promise.all([
      this.interestScores.sampleByScoreBucket(
        userId,
        SCORE_BUCKET_LOW.min,
        SCORE_BUCKET_LOW.max,
        SCORE_BUCKET_SAMPLE_SIZE,
      ),
      this.interestScores.sampleByScoreBucket(
        userId,
        SCORE_BUCKET_MID.min,
        SCORE_BUCKET_MID.max,
        SCORE_BUCKET_SAMPLE_SIZE,
      ),
      this.interestScores.sampleByScoreBucket(
        userId,
        SCORE_BUCKET_HIGH.min,
        SCORE_BUCKET_HIGH.max,
        SCORE_BUCKET_SAMPLE_SIZE,
      ),
    ]);
    return {
      low: low.map(docToBucketEntry),
      mid: mid.map(docToBucketEntry),
      high: high.map(docToBucketEntry),
    };
  }
}

function docToBucketEntry(doc: { snapshot: SongSnapshot }): TasteDrivenScoreBucketEntry {
  return { title: doc.snapshot.title, artist: doc.snapshot.artist };
}

function shuffleCopy<T>(items: ReadonlyArray<T>): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

function toSnapshot(track: TrackResult): SongSnapshot {
  const trustedArtwork = track.provider === "soundcloud" ? undefined : track.artworkUrl;
  return {
    title: track.title,
    artist: track.artist,
    kind: "track",
    ...(trustedArtwork !== undefined ? { coverUrl: trustedArtwork } : {}),
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

function toAsymmetricSwipes(
  docs: ReadonlyArray<{ snapshotHash: string; direction: "right" | "left"; at: Date }>,
): AsymmetricSwipe[] {
  return docs.map((d) => ({ snapshotHash: d.snapshotHash, direction: d.direction, at: d.at }));
}

function toSoftSuppressSwipes(
  docs: ReadonlyArray<{ snapshot: SongSnapshot; direction: "right" | "left" }>,
): SoftSuppressSwipe[] {
  return docs.map((d) => ({ direction: d.direction, artist: d.snapshot.artist }));
}
