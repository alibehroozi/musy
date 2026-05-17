import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { v4 as uuidv4 } from "uuid";
import {
  buildCustomMixPrompt,
  clampScore,
  generalScore,
  MAX_CUSTOM_MIX_POOL,
  parseCustomMixResponse,
  type ContextScoreRow,
  type CustomMixPoolSong,
} from "@moc/api-core";
import type { ContextAxis, CustomMixCreatedResponse, SongSnapshot } from "@moc/contracts";

import { SwipesRepository } from "./explore.repository.js";
import { AnthropicClient } from "./anthropic.client.js";
import { BucketsRepository } from "../taste/buckets.repository.js";
import { BucketSongScoresRepository } from "../taste/bucket-song-scores.repository.js";
import { ContextScoresRepository } from "../taste/context-scores.repository.js";
import { CustomMixJobsRepository } from "../taste/custom-mix-jobs.repository.js";
import { InterestScoresRepository } from "../search/interest-scores.repository.js";

const DEFAULT_MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 4096;

// API-27: a custom mix takes a few seconds end-to-end; five concurrent
// per user is intentionally generous. The cap exists to stop a runaway
// scripted client (or a stuck job) from monopolizing one user's
// Anthropic quota.
const MAX_CONCURRENT_PER_USER = 5;

@Injectable()
export class CustomMixService {
  private readonly logger = new Logger(CustomMixService.name);

  // Single-replica fast path for API-27. The Map tracks jobIds we know
  // we started in this process; the Mongo count handles cross-replica
  // visibility (the cap is enforced as max(in-memory, mongo)).
  private readonly inFlight = new Map<string, Set<string>>();

  constructor(
    @Inject(SwipesRepository) private readonly swipes: SwipesRepository,
    @Inject(InterestScoresRepository)
    private readonly interestScores: InterestScoresRepository,
    @Inject(BucketsRepository) private readonly bucketsRepo: BucketsRepository,
    @Inject(BucketSongScoresRepository)
    private readonly scoresRepo: BucketSongScoresRepository,
    @Inject(ContextScoresRepository)
    private readonly contextScoresRepo: ContextScoresRepository,
    @Inject(CustomMixJobsRepository)
    private readonly jobsRepo: CustomMixJobsRepository,
    @Inject(AnthropicClient) private readonly anthropic: AnthropicClient,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  /**
   * The POST /me/taste/custom-mix happy-path entry. Validates the
   * prompt, checks rate limit, computes the touched-songs pool, then
   * pre-inserts the bucket + job rows and returns
   * `{ jobId, bucketId }` to the caller. The Anthropic call runs
   * fire-and-forget inside `runBuild`, started here as a detached
   * promise (the controller's HTTP response resolves immediately).
   *
   * SEC-16: every write derives `userId` from the caller's argument.
   */
  async create(input: { userId: string; promptText: string }): Promise<CustomMixCreatedResponse> {
    // Validate prompt — the controller's Zod parse already enforces
    // length, but trim/empty-after-trim is a content check that lives
    // here. A whitespace-only prompt still passes Zod's .min(1).
    const promptText = input.promptText.trim();
    if (promptText.length === 0) {
      throw new BadRequestException("promptText is empty after trim");
    }

    // API-27: in-flight check before any DB writes.
    const inMemorySet = this.inFlight.get(input.userId);
    const inMemoryCount = inMemorySet ? inMemorySet.size : 0;
    if (inMemoryCount >= MAX_CONCURRENT_PER_USER) {
      throw new HttpException("Wait for your current mix to finish.", HttpStatus.TOO_MANY_REQUESTS);
    }
    const dbCount = await this.jobsRepo.countInFlight(input.userId);
    if (Math.max(inMemoryCount, dbCount) >= MAX_CONCURRENT_PER_USER) {
      throw new HttpException("Wait for your current mix to finish.", HttpStatus.TOO_MANY_REQUESTS);
    }

    // Build the touched-songs pool. Empty pool → 422 (cold start).
    const pool = await this.buildPool(input.userId);
    if (pool.length === 0) {
      throw new UnprocessableEntityException(
        "Build your Taste first — swipe in Explore to add songs to your pool.",
      );
    }

    const jobId = uuidv4();
    const bucketId = uuidv4();
    const now = new Date();

    await this.bucketsRepo.insertCustomBucket({
      id: bucketId,
      userId: input.userId,
      promptText,
      createdAt: now,
    });
    await this.jobsRepo.insert({
      jobId,
      userId: input.userId,
      bucketId,
      promptText,
      startedAt: now,
    });

    // Reserve the in-memory slot before returning so a fast-follower
    // request observes the new count.
    const set = this.inFlight.get(input.userId) ?? new Set<string>();
    set.add(jobId);
    this.inFlight.set(input.userId, set);

    // Fire-and-forget. The detached promise handles its own errors —
    // it marks the bucket + job as `failed` and logs. The HTTP
    // response does not block on the Anthropic call (API-26).
    void this.runBuild({
      userId: input.userId,
      jobId,
      bucketId,
      promptText,
      pool,
    });

    return { jobId, bucketId };
  }

  private async runBuild(args: {
    userId: string;
    jobId: string;
    bucketId: string;
    promptText: string;
    pool: { song: CustomMixPoolSong; snapshot: SongSnapshot }[];
  }): Promise<void> {
    const { userId, jobId, bucketId, promptText, pool } = args;
    try {
      const buckets = await this.bucketsRepo.findForUser(userId);
      const { system, userMessage } = buildCustomMixPrompt({
        promptText,
        pool: pool.map((p) => p.song),
        buckets: buckets
          .filter((b) => b.id !== bucketId)
          .map((b) => ({ id: b.id, name: b.name, description: b.description })),
      });

      const model = this.config.get<string>("ANTHROPIC_MODEL") ?? DEFAULT_MODEL;
      const response = await this.anthropic.complete({
        system,
        userMessage,
        model,
        maxTokens: MAX_TOKENS,
      });

      const parsed = parseCustomMixResponse(response.text);

      // Filter LLM picks against the pool — any songKey not present
      // gets dropped. Empty filtered set → mark failed.
      const poolByKey = new Map<string, SongSnapshot>(
        pool.map((p) => [p.song.songKey, p.snapshot] as const),
      );
      const sourceBuckets: Record<string, string[]> = {};
      const picks: { songKey: string; initialScore: number; snapshot: SongSnapshot }[] = [];
      for (const s of parsed.songs) {
        const snapshot = poolByKey.get(s.songKey);
        if (!snapshot) continue;
        picks.push({ songKey: s.songKey, initialScore: s.initialScore, snapshot });
        sourceBuckets[s.songKey] = s.sourceBuckets ?? [];
      }

      if (picks.length === 0) {
        await this.markFailed({
          userId,
          jobId,
          bucketId,
          errorReason: "model_returned_no_valid_songs",
        });
        return;
      }

      const now = new Date();
      const name = parsed.name.trim().slice(0, 60);
      const description = parsed.description.slice(0, 200);

      for (const pick of picks) {
        await this.scoresRepo.insertInitialScore({
          userId,
          bucketId,
          songKey: pick.songKey,
          snapshot: pick.snapshot,
          initialScore: clampScore(pick.initialScore),
          at: now,
        });
      }
      await this.bucketsRepo.markCustomReady({
        userId,
        bucketId,
        name: name.length > 0 ? name : "Custom mix",
        description,
        lastBuiltAt: now,
      });
      await this.jobsRepo.markCompleted({ jobId, sourceBuckets, completedAt: now });

      this.logger.log(
        {
          event: "custom_mix_build_completed",
          userId,
          jobId,
          bucketId,
          assignments: picks.length,
        },
        "custom_mix_build_completed",
      );
    } catch (err) {
      await this.markFailed({
        userId,
        jobId,
        bucketId,
        errorReason: errToString(err),
      });
    } finally {
      const set = this.inFlight.get(userId);
      if (set) {
        set.delete(jobId);
        if (set.size === 0) this.inFlight.delete(userId);
      }
    }
  }

  private async markFailed(args: {
    userId: string;
    jobId: string;
    bucketId: string;
    errorReason: string;
  }): Promise<void> {
    const now = new Date();
    await this.bucketsRepo.markCustomFailed({
      userId: args.userId,
      bucketId: args.bucketId,
      errorReason: args.errorReason,
    });
    await this.jobsRepo.markFailed({
      jobId: args.jobId,
      errorReason: args.errorReason,
      completedAt: now,
    });
    this.logger.error(
      {
        event: "custom_mix_build_failed",
        userId: args.userId,
        jobId: args.jobId,
        bucketId: args.bucketId,
        errorReason: args.errorReason,
      },
      "custom_mix_build_failed",
    );
  }

  /**
   * Touched-songs pool for the user — right-swiped ∪ saved ∪
   * listen-completed, deduped by songKey, newest-first, capped at
   * MAX_CUSTOM_MIX_POOL. Joins per-song with context_scores +
   * bucket_song_scores to compute `generalScore` (LOGIC-32) so the
   * LLM sees the user's current contextual ranking.
   *
   * SEC-16: every read goes through a `userId`-scoped repository
   * method; no row from another user can reach this method's output.
   */
  private async buildPool(
    userId: string,
  ): Promise<{ song: CustomMixPoolSong; snapshot: SongSnapshot }[]> {
    const [swipeDocs, scoreDocs, contextRows, bucketRows] = await Promise.all([
      this.swipes.findSwipesForUser(userId),
      this.interestScores.findScoresForUser(userId),
      this.contextScoresRepo.findForUser(userId),
      this.scoresRepo.findScoresForUser(userId),
    ]);

    type Entry = {
      songKey: string;
      snapshot: SongSnapshot;
      at: Date;
    };
    const byKey = new Map<string, Entry>();

    for (const s of swipeDocs) {
      const key = `snap:${s.snapshotHash}`;
      if (s.direction !== "right") continue;
      const at = s.at instanceof Date ? s.at : new Date(s.at);
      const existing = byKey.get(key);
      if (!existing || at > existing.at) {
        byKey.set(key, { songKey: key, snapshot: s.snapshot, at });
      }
    }
    for (const score of scoreDocs) {
      if (score.lastEventType !== "saved" && score.lastEventType !== "completed") continue;
      const at =
        score.lastEventAt instanceof Date ? score.lastEventAt : new Date(score.lastEventAt);
      const existing = byKey.get(score.songKey);
      if (!existing || at > existing.at) {
        byKey.set(score.songKey, { songKey: score.songKey, snapshot: score.snapshot, at });
      }
    }

    const contextBySong = groupByKey(
      contextRows,
      (r) => r.songKey,
      (r) => ({ axis: r.axis as ContextAxis, value: r.value, score: r.score }),
    );
    const bucketBySong = groupByKey(
      bucketRows,
      (r) => r.songKey,
      (r) => ({ bucketId: r.bucketId, score: r.score }),
    );

    return [...byKey.values()]
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .slice(0, MAX_CUSTOM_MIX_POOL)
      .map(({ songKey, snapshot }) => {
        const ctx: ContextScoreRow[] = contextBySong.get(songKey) ?? [];
        const bkt = bucketBySong.get(songKey) ?? [];
        return {
          song: {
            songKey,
            title: snapshot.title,
            artist: snapshot.artist,
            kind: snapshot.kind,
            generalScore: generalScore(ctx, bkt),
          },
          snapshot,
        };
      });
  }
}

function groupByKey<TRow, TOut>(
  rows: readonly TRow[],
  keyFn: (r: TRow) => string,
  project: (r: TRow) => TOut,
): Map<string, TOut[]> {
  const out = new Map<string, TOut[]>();
  for (const r of rows) {
    const key = keyFn(r);
    const list = out.get(key) ?? [];
    list.push(project(r));
    out.set(key, list);
  }
  return out;
}

function errToString(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  return String(err);
}
