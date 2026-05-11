import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { v4 as uuidv4 } from "uuid";
import {
  ARTIST_REFINEMENT_PICKS_TARGET,
  buildArtistRefinementPrompt,
  buildColdStartPrompt,
  buildPersonalizedPrompt,
  COLD_START_MAX_RECENT_SWIPES,
  computeSnapshotHash,
  parseArtistRefinementResponse,
  parseColdStartResponse,
  parsePersonalizedResponse,
  phaseFor,
  pickCoverMatch,
  resolveCoversForQueue,
  seedSnapshots,
  STRONG_ARTIST_SCORE_THRESHOLD,
  type ArtistRefinementPromptCandidate,
  type ColdStartPromptSwipe,
  type PersonalizedPromptCandidate,
  type PersonalizedScoreBuckets,
  type ScoreBucketEntry,
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
import { ProfileBuilderService, SWIPE_TRIGGER_THRESHOLD } from "./profile-builder.service.js";
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
const PERSONALIZED_MAX_TOKENS = 4096;
const ARTIST_REFINEMENT_MAX_TOKENS = 4096;

// Artist refinement phase — top N profile artists feed the SoundCloud
// search fan-out. Caps upstream egress at 8 concurrent searches per
// rebuild and aligns with phaseFor's "strong artists < 8" exit gate:
// even if the user has more than 8 weak-signal artists, refinement
// only ever asks about the 8 best.
const ARTIST_REFINEMENT_TOP_ARTISTS = 8;
const ARTIST_REFINEMENT_SONGS_PER_ARTIST = 5;

// Personalized phase: how many distinct artists from profile.artists
// reach the prompt — chosen uniformly at random per rebuild so consecutive
// rebuilds get different angles on the user's taste. LOGIC-25.
const PERSONALIZED_ARTIST_SHUFFLE_SIZE = 5;
// Top genres always reach the prompt (no shuffle — they're already
// score-ranked in the profile).
const PERSONALIZED_TOP_GENRES = 3;
// Per the design: 10 random songs from each score bucket reach the prompt
// as "songs the user has already rated at this level" context.
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
   *
   * The previous sync-block-on-first-hit was removed: cold-start LLM
   * latency is 5–30 s and blocking the HTTP response that long is worse
   * UX than returning empty + the buildingQueue flag immediately.
   *
   * `count` is clamped to [MIN_COUNT, MAX_COUNT]; the response carries
   * the top `count` items of the queue.
   */
  async getNext(userId: string, count: number): Promise<NextResponse> {
    const safeCount = Math.max(MIN_COUNT, Math.min(MAX_COUNT, Math.floor(count)));
    const queue = await this.queues.findForUser(userId);

    if (!queue) {
      // No queue yet (first visit). Fire an async rebuild — the FE will
      // observe buildingQueue: true and poll until items arrive.
      this.kickoffRebuild(userId);
      return {
        items: [],
        phase: "discovery",
        partial: true,
        buildingQueue: true,
      };
    }

    // Filter against swipes and cover-completeness (API-17 defense in
    // depth — the queue builder is the primary enforcement, but stale
    // pre-DATA-13 rows could still slip through).
    const swipeDocs = await this.swipes.findSwipesForUser(userId);
    const seenHashes = new Set(swipeDocs.map((s) => s.snapshotHash));
    const filtered = queue.items.filter(
      (item) => !seenHashes.has(computeSnapshotHash(item)) && hasNonEmptyCover(item),
    );

    // Self-heal: if unseen runs low and no rebuild is in flight, fire
    // one. This complements the swipe-write-triggered maybeRefill
    // (API-18) — for example, a user opening the app cold with a stale
    // queue from a previous session.
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
   * Force-rebuild the queue. Per spec, this is also fired by the swipe
   * handler when the queue dips below REFILL_THRESHOLD items (measured
   * as unseen-remaining; see API-18).
   *
   * Idempotent per user (API-21): concurrent invocations for the same
   * userId share one underlying build — the second caller awaits the
   * first's promise rather than starting a duplicate sourcing pipeline.
   * The in-flight entry is cleared on settle so the *next* rebuild
   * cycle starts fresh.
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

    // API-19: discovery-exit ritual. When the user has crossed the
    // profile-build threshold but no profile has been persisted yet,
    // the fire-and-forget build kicked off by recordSwipe may still be
    // in flight. If we don't await it here, sourceCandidates will run
    // the discovery path again (asking the cold-start LLM for tracks
    // that overlap with what the user just swiped) and the queue will
    // re-empty. buildIfDue self-no-ops if the build isn't actually due
    // — this guard just prevents the redundant read when we know it
    // isn't.
    if (profile === null && swipeDocs.length >= SWIPE_TRIGGER_THRESHOLD) {
      await this.profileBuilder.buildIfDue(userId);
      profile = await this.profileBuilder.getProfile(userId);
    }

    const phase = phaseFor(profile, swipeDocs.length);

    const seenHashes = new Set(swipeDocs.map((s) => s.snapshotHash));
    // Project swipes for the cold-start soft signal (LOGIC-28). Newest-
    // first so the per-prompt truncation drops oldest. Only the discovery
    // path actually reads this; other phases ignore it.
    const recentSwipesForColdStart: ColdStartPromptSwipe[] = swipeDocs
      .slice()
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .slice(0, COLD_START_MAX_RECENT_SWIPES)
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
        seenHashes,
        recentSwipesForColdStart,
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
   *
   * Per API-18 the "short queue" signal is the count of **unseen** items
   * remaining, not the raw `items.length` of the stored document. Swipes
   * append to a separate collection and never prune the queue, so raw
   * length stays at ~20 even after every item has been swiped — masking
   * the exhaustion signal. Computing unseen here lets the trigger fire
   * exactly when the user would otherwise see `{items:[], partial:true}`
   * on the next /next.
   */
  async maybeRefill(userId: string): Promise<void> {
    const queue = await this.queues.findForUser(userId);
    if (!queue) return;

    const swipeDocs = await this.swipes.findSwipesForUser(userId);
    const seenHashes = new Set(swipeDocs.map((s) => s.snapshotHash));
    const unseen = queue.items.filter((item) => !seenHashes.has(computeSnapshotHash(item))).length;
    if (unseen >= REFILL_THRESHOLD) return;

    this.logger.log(
      {
        event: "explore_queue_refill_triggered",
        userId,
        unseen,
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
    seenHashes: Set<string>,
    recentSwipesForColdStart: ColdStartPromptSwipe[],
  ): Promise<SongSnapshot[]> {
    if (phase === "discovery") {
      return await this.sourceDiscovery(seenHashes, recentSwipesForColdStart);
    }

    if (phase === "artist-refinement") {
      return await this.sourceArtistRefinement(profile, seenHashes);
    }

    return await this.sourcePersonalized(userId, profile, seenHashes);
  }

  /**
   * Discovery phase: ask Claude to generate a diverse initial set of
   * canonical commercial titles. Emits `{title, artist}` tuples only —
   * the downstream cover-resolution step (`resolveCoversForCandidates`)
   * is the single authority for covers, fanning out to the unified
   * search aggregator (Audius + Deezer + RadioBrowser + Genius) and
   * dropping anything Deezer / Genius can't cover.
   *
   * SoundCloud is deliberately NOT consulted here: its user-upload
   * catalog has unreliable artwork, and using its `artworkUrl` would
   * smuggle covers from a source we've decided to exclude. Falls back
   * to the static seed list if the cold-start LLM fails.
   *
   * `recentSwipes` is the soft-signal payload from LOGIC-28. Empty
   * on the user's first call (the cache-friendly path); non-empty on
   * rebuilds within the discovery phase so the LLM leans toward the
   * feel of right-swiped items and away from left-swiped ones without
   * hard-excluding any artist.
   */
  private async sourceDiscovery(
    seenHashes: Set<string>,
    recentSwipes: ColdStartPromptSwipe[],
  ): Promise<SongSnapshot[]> {
    try {
      const { system, userMessage } = buildColdStartPrompt({ recentSwipes });
      const model = this.config.get<string>("ANTHROPIC_MODEL") ?? DEFAULT_MODEL;
      const response = await this.anthropic.complete({
        system,
        userMessage,
        model,
        maxTokens: 1024,
      });
      const suggestions = parseColdStartResponse(response.text);
      if (suggestions.length === 0) throw new Error("cold-start: empty response");

      const tuples: SongSnapshot[] = suggestions.map(({ title, artist }) => ({
        title,
        artist,
        kind: "track",
      }));

      const result = dedupeBySnapshotHash(tuples, seenHashes);
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

  /**
   * Artist-refinement phase — LOGIC-26 / AI-09 / PRIVACY-10.
   *
   * Inputs to the LLM:
   *   - The full profile (projected per PRIVACY-10).
   *   - A candidate pool built per-artist: for each of the top
   *     ARTIST_REFINEMENT_TOP_ARTISTS in profile.artists (ranked by
   *     score), query SoundCloud and keep the first
   *     ARTIST_REFINEMENT_SONGS_PER_ARTIST hits. Audius is intentionally
   *     not consulted here — the artist-name search shape works better
   *     on SoundCloud's index, and keeping the pool source single-
   *     provider makes downstream cover resolution more predictable.
   *
   * LLM output: up to ARTIST_REFINEMENT_PICKS_TARGET picks from the
   * pool (verbatim). Caller dedupes against seenHashes; LLM failures
   * fall through to the deduped pool top-N so the queue is never empty
   * when there's pool content available.
   */
  private async sourceArtistRefinement(
    profile: TasteProfile | null,
    seenHashes: Set<string>,
  ): Promise<SongSnapshot[]> {
    if (!profile || profile.artists.length === 0) return [];

    // Fan out only on the user's strong-signal artists (>= 0.5). Avoids
    // polluting the SoundCloud pool with songs from rejected artists.
    // If there are zero strong-signal artists yet (e.g. a brand-new
    // profile with only weak / mixed signals), fall back to top-N by
    // score so the user still gets a pool — the LLM filter step has
    // the per-artist scores in the profile projection and can
    // deprioritize the weak ones at the pick step.
    const strongArtists = profile.artists.filter((a) => a.score >= STRONG_ARTIST_SCORE_THRESHOLD);
    const seedArtists = strongArtists.length > 0 ? strongArtists : profile.artists;
    const rankedArtists = [...seedArtists]
      .sort((a, b) => b.score - a.score)
      .slice(0, ARTIST_REFINEMENT_TOP_ARTISTS);
    const artistNames = rankedArtists.map((a) => a.name);

    const settled = await Promise.allSettled(
      artistNames.map((name) =>
        this.soundcloud
          .search(name)
          .then((hits) => hits.slice(0, ARTIST_REFINEMENT_SONGS_PER_ARTIST))
          .catch(() => [] as TrackResult[]),
      ),
    );

    const fulfilledTracks: TrackResult[] = [];
    for (const r of settled) {
      if (r.status === "fulfilled") {
        for (const t of r.value) fulfilledTracks.push(t);
      }
    }

    const dedupedPool = dedupeBySnapshotHash(
      fulfilledTracks.map((track) => toSnapshot(track)),
      seenHashes,
    );

    if (dedupedPool.length === 0) return [];

    const candidatePool: ArtistRefinementPromptCandidate[] = dedupedPool.map((s) => ({
      title: s.title,
      artist: s.artist,
      source: "soundcloud",
    }));

    const { system, userMessage } = buildArtistRefinementPrompt({
      profile,
      candidatePool,
    });

    let parsed = { picks: [] as Array<{ title: string; artist: string }> };
    try {
      const model = this.config.get<string>("ANTHROPIC_MODEL") ?? DEFAULT_MODEL;
      const response = await this.anthropic.complete({
        system,
        userMessage,
        model,
        maxTokens: ARTIST_REFINEMENT_MAX_TOKENS,
      });
      parsed = parseArtistRefinementResponse(response.text);
    } catch (err) {
      this.logger.warn(
        { event: "explore_queue_artist_refinement_failed", err: errToString(err) },
        "explore_queue_artist_refinement_failed",
      );
    }

    // Match picks against pool by (title, artist) — anything the LLM
    // hallucinated outside the pool is dropped silently.
    const poolByKey = new Map(dedupedPool.map((s) => [`${s.title}::${s.artist}`, s]));
    const picks: SongSnapshot[] = [];
    for (const p of parsed.picks) {
      const snap = poolByKey.get(`${p.title}::${p.artist}`);
      if (snap) picks.push(snap);
    }

    const final = picks.slice(0, ARTIST_REFINEMENT_PICKS_TARGET);
    if (final.length > 0) return final;

    // Heuristic fallback: LLM produced nothing usable — surface the
    // deduped pool top-N so the queue isn't empty.
    return dedupedPool.slice(0, ARTIST_REFINEMENT_PICKS_TARGET);
  }

  /**
   * Personalized phase — LOGIC-25 / API-21 / PRIVACY-09.
   *
   * Inputs to the LLM:
   *   - The *full* profile, with profile.artists shuffled to 5 of N (so
   *     consecutive rebuilds get different angles on the user's taste).
   *   - Three sampled score buckets from interest_scores: 10 random
   *     entries each at scores 0–3 (low), 4–7 (mid), 8–10 (high). The
   *     LLM treats these as "songs the user has already reacted to" so
   *     novel suggestions know what to avoid.
   *   - The Audius + SoundCloud candidate pool built from the 5
   *     shuffled artists + 3 top genres (same provider mix as before
   *     this change — "as we do now" in the design doc).
   *
   * LLM output: 10 picks from the pool (verbatim) + 10 novel suggestions
   * NOT in any score bucket. The caller dedupes both lists against
   * seenHashes (swipes ledger) and against the score buckets in case
   * the LLM ignored the prompt rule.
   *
   * Falls through to the deduped raw pool on LLM / parser failure so
   * the queue is never empty when there's pool content available.
   */
  private async sourcePersonalized(
    userId: string,
    profile: TasteProfile | null,
    seenHashes: Set<string>,
  ): Promise<SongSnapshot[]> {
    if (!profile) return [];

    // Shuffle artists then take 5 — variety across rebuilds.
    const shuffledArtists = shuffleCopy(profile.artists).slice(0, PERSONALIZED_ARTIST_SHUFFLE_SIZE);
    const artistNames = shuffledArtists.map((a) => a.name);
    const topGenres = profile.genres.slice(0, PERSONALIZED_TOP_GENRES).map((g) => g.name);

    // Score-bucket sampling runs in parallel with the provider searches.
    const queries = [...artistNames, ...topGenres];
    const [bucketsResult, providerResults] = await Promise.all([
      this.sampleAllBuckets(userId),
      Promise.allSettled(
        queries.flatMap((q) => [
          this.audius.search(q).catch(() => [] as TrackResult[]),
          this.soundcloud.search(q).catch(() => [] as TrackResult[]),
        ]),
      ),
    ]);

    const fulfilledTracks: Array<{ track: TrackResult; provider: TrackResult["provider"] }> = [];
    for (const r of providerResults) {
      if (r.status === "fulfilled") {
        for (const t of r.value) fulfilledTracks.push({ track: t, provider: t.provider });
      }
    }
    const dedupedPool = dedupeBySnapshotHash(
      fulfilledTracks.map(({ track }) => toSnapshot(track)),
      seenHashes,
    );

    // Per-snapshot lookup so the prompt can carry the original provider
    // tag (audius/soundcloud) for the LLM's reference.
    const providerByKey = new Map<string, TrackResult["provider"]>();
    fulfilledTracks.forEach(({ track, provider }) => {
      providerByKey.set(`${track.title}::${track.artist}`, provider);
    });

    const candidatePool: PersonalizedPromptCandidate[] = dedupedPool.map((s) => ({
      title: s.title,
      artist: s.artist,
      source: providerByKey.get(`${s.title}::${s.artist}`) ?? "audius",
    }));

    const scoreBuckets: PersonalizedScoreBuckets = bucketsResult;
    const shuffledProfile: TasteProfile = { ...profile, artists: shuffledArtists };

    const { system, userMessage } = buildPersonalizedPrompt({
      profile: shuffledProfile,
      scoreBuckets,
      candidatePool,
    });

    let parsed = {
      picks_from_pool: [] as Array<{ title: string; artist: string }>,
      novel_suggestions: [] as Array<{ title: string; artist: string }>,
    };
    try {
      const model = this.config.get<string>("ANTHROPIC_MODEL") ?? DEFAULT_MODEL;
      const response = await this.anthropic.complete({
        system,
        userMessage,
        model,
        maxTokens: PERSONALIZED_MAX_TOKENS,
      });
      parsed = parsePersonalizedResponse(response.text);
    } catch (err) {
      this.logger.warn(
        { event: "explore_queue_personalized_failed", err: errToString(err) },
        "explore_queue_personalized_failed",
      );
    }

    // Match picks against pool by (title, artist) — anything the LLM
    // hallucinated outside the pool is dropped silently.
    const poolByKey = new Map(dedupedPool.map((s) => [`${s.title}::${s.artist}`, s]));
    const picks: SongSnapshot[] = [];
    for (const p of parsed.picks_from_pool) {
      const snap = poolByKey.get(`${p.title}::${p.artist}`);
      if (snap) picks.push(snap);
    }

    // Novel suggestions: convert (title, artist) → bare SongSnapshot.
    // Cover resolution downstream (resolveCoversForCandidates) fills
    // in coverUrl or drops entries that can't be covered.
    const bucketKeys = new Set<string>(
      [...scoreBuckets.low, ...scoreBuckets.mid, ...scoreBuckets.high].map(
        (e) => `${e.title}::${e.artist}`,
      ),
    );
    const novel: SongSnapshot[] = [];
    for (const n of parsed.novel_suggestions) {
      const key = `${n.title}::${n.artist}`;
      // Drop if the LLM ignored the prompt rule and surfaced a track
      // already in any score bucket.
      if (bucketKeys.has(key)) continue;
      novel.push({ title: n.title, artist: n.artist, kind: "track" });
    }

    // Combine picks + novel, dedupe against seenHashes (and against
    // each other — a novel suggestion may collide with a pick title).
    const combined = dedupeBySnapshotHash([...picks, ...novel], seenHashes);
    if (combined.length > 0) return combined;

    // Heuristic fallback: if the LLM produced nothing usable, surface
    // the deduped pool so the queue isn't empty.
    return dedupedPool;
  }

  /**
   * Sample 10 entries from each of the three score buckets. Returns
   * empty arrays for buckets with no matching docs (sparse-history
   * users — common during initial rebuilds).
   */
  private async sampleAllBuckets(userId: string): Promise<PersonalizedScoreBuckets> {
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

function docToBucketEntry(doc: { snapshot: SongSnapshot }): ScoreBucketEntry {
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
  // SoundCloud's artworkUrl is from user uploads — drop it so the
  // cover-resolution step picks the cover from a trusted aggregator
  // source (Deezer / Genius / Audius via SearchService).
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
