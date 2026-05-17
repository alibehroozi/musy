import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { v4 as uuidv4 } from "uuid";
import {
  buildBucketPrompt,
  clampScore,
  normalizeBucketName,
  parseBucketBuilderResponse,
  selectUnbucketedPool,
  type PromptSong,
  MAX_BUCKET_SONGS,
} from "@moc/api-core";

import { SwipesRepository } from "./explore.repository.js";
import { AnthropicClient } from "./anthropic.client.js";
import { BucketsRepository } from "../taste/buckets.repository.js";
import { BucketSongScoresRepository } from "../taste/bucket-song-scores.repository.js";
import { InterestScoresRepository } from "../search/interest-scores.repository.js";

const DEFAULT_MODEL = "claude-sonnet-4-6";
// Doubled from 4096 as belt-and-braces against `max_tokens` truncation —
// per-run input is now bounded by AI-13's 20-song cap so 4096 would
// already be safe, but leaving headroom protects against future spec
// changes that grow per-song assignment fan-out.
const MAX_TOKENS = 8192;

@Injectable()
export class BucketBuilderService {
  private readonly logger = new Logger(BucketBuilderService.name);

  // Same in-flight dedup as ProfileBuilderService — concurrent triggers
  // for the same user share a single build.
  private readonly inFlightBuilds = new Map<string, Promise<void>>();

  constructor(
    @Inject(SwipesRepository) private readonly swipes: SwipesRepository,
    @Inject(InterestScoresRepository)
    private readonly interestScores: InterestScoresRepository,
    @Inject(BucketsRepository) private readonly bucketsRepo: BucketsRepository,
    @Inject(BucketSongScoresRepository)
    private readonly scoresRepo: BucketSongScoresRepository,
    @Inject(AnthropicClient) private readonly anthropic: AnthropicClient,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  /**
   * Fire-and-forget trigger called after profile-builder.runBuild() succeeds.
   * Swallows errors so profile-builder callers are unaffected by bucket failures.
   */
  async maybeBuild(userId: string): Promise<void> {
    void this.doBuildIfDue(userId).catch((err) => {
      this.logger.error(
        { event: "auto_bucket_build_failed", userId, err: errToString(err) },
        "auto_bucket_build_failed",
      );
    });
  }

  private async doBuildIfDue(userId: string): Promise<void> {
    const inFlight = this.inFlightBuilds.get(userId);
    if (inFlight) return inFlight;

    const promise = this.runBuild(userId)
      .catch((err: unknown) => {
        this.logger.error(
          { event: "auto_bucket_build_failed", userId, err: errToString(err) },
          "auto_bucket_build_failed",
        );
      })
      .finally(() => {
        this.inFlightBuilds.delete(userId);
      });

    this.inFlightBuilds.set(userId, promise);
    return promise;
  }

  private async runBuild(userId: string): Promise<void> {
    // SEC-15: all reads scoped to userId.
    const [swipeDocs, scoreDocs, existingBuckets, scoredSongKeys] = await Promise.all([
      this.swipes.findSwipesForUser(userId),
      this.interestScores.findScoresForUser(userId),
      this.bucketsRepo.findForUser(userId),
      this.scoresRepo.findScoredSongKeysForUser(userId),
    ]);

    const { pool, snapshotLookup } = buildSignalData(swipeDocs, scoreDocs);

    // LOGIC-38: incremental policy — only consider songs the LLM has not
    // already bucketed for this user. Cap is the AI-13 per-run bound.
    const unbucketed = selectUnbucketedPool({
      pool,
      scoredSongKeys,
      cap: MAX_BUCKET_SONGS,
    });

    if (unbucketed.length === 0) {
      return;
    }

    this.logger.log(
      { event: "auto_bucket_build_started", userId, poolSize: unbucketed.length },
      "auto_bucket_build_started",
    );

    const { system, userMessage } = buildBucketPrompt({
      recentSongs: unbucketed,
      existingBuckets: existingBuckets.map((b) => ({ name: b.name, description: b.description })),
    });

    const model = this.config.get<string>("ANTHROPIC_MODEL") ?? DEFAULT_MODEL;
    const response = await this.anthropic.complete({
      system,
      userMessage,
      model,
      maxTokens: MAX_TOKENS,
    });

    let parsed;
    try {
      parsed = parseBucketBuilderResponse(response.text);
    } catch (err) {
      this.logger.error(
        {
          event: "auto_bucket_build_failed",
          userId,
          reason: "llm_parse_failed",
          err: errToString(err),
        },
        "auto_bucket_build_failed",
      );
      return;
    }

    // Build a lookup: normalized name → bucket id (existing + newly inserted).
    const bucketIdByNorm = new Map<string, string>();
    for (const b of existingBuckets) {
      bucketIdByNorm.set(normalizeBucketName(b.name), b.id);
    }

    const now = new Date();

    // Insert new buckets (skip duplicates by normalized name — DATA-18).
    for (const nb of parsed.newBuckets) {
      const norm = normalizeBucketName(nb.name);
      if (bucketIdByNorm.has(norm)) continue;
      const id = uuidv4();
      await this.bucketsRepo.insertBucket({
        id,
        userId,
        name: nb.name,
        description: nb.description || null,
        kind: "auto",
        state: "ready",
        createdAt: now,
        lastBuiltAt: now,
      });
      bucketIdByNorm.set(norm, id);
    }

    let assignmentCount = 0;
    for (const assignment of parsed.assignments) {
      const bucketId = bucketIdByNorm.get(normalizeBucketName(assignment.bucket));
      if (!bucketId) {
        this.logger.warn(
          {
            event: "auto_bucket_assignment_unknown_bucket",
            userId,
            bucket: assignment.bucket,
            songKey: assignment.songKey,
          },
          "auto_bucket_assignment_unknown_bucket",
        );
        continue;
      }

      const snapshot = snapshotLookup.get(assignment.songKey);
      if (!snapshot) {
        this.logger.warn(
          {
            event: "auto_bucket_assignment_unknown_song",
            userId,
            songKey: assignment.songKey,
          },
          "auto_bucket_assignment_unknown_song",
        );
        continue;
      }

      // LOGIC-34: insert-only on score.
      await this.scoresRepo.insertInitialScore({
        userId,
        bucketId,
        songKey: assignment.songKey,
        snapshot,
        initialScore: clampScore(assignment.initialScore),
        at: now,
      });
      assignmentCount++;
    }

    this.logger.log(
      {
        event: "auto_bucket_build_completed",
        userId,
        newBuckets: parsed.newBuckets.length,
        assignments: assignmentCount,
      },
      "auto_bucket_build_completed",
    );
  }
}

/**
 * Reads swipes + interest_scores once and returns both the full
 * newest-first positive-signal pool and a songKey → snapshot lookup
 * for assignment resolution. The pool is NOT capped here — `runBuild`
 * applies `selectUnbucketedPool` to filter already-scored songs and
 * cap to MAX_BUCKET_SONGS in a single step (LOGIC-38).
 *
 * Positive signal:
 * - Right-swiped songs from swipes (snapshot embedded)
 * - Saved + listened-completed songs from interest_scores (snapshot embedded)
 *
 * SEC-15: callers must pass docs already scoped to userId.
 */
function buildSignalData(
  swipeDocs: Array<{
    snapshotHash: string;
    snapshot: import("@moc/contracts").SongSnapshot;
    direction: string;
    at: Date | string;
  }>,
  scoreDocs: Array<{
    songKey: string;
    snapshot: import("@moc/contracts").SongSnapshot;
    lastEventType: string;
    lastEventAt: Date | string;
  }>,
): {
  pool: PromptSong[];
  snapshotLookup: Map<string, import("@moc/contracts").SongSnapshot>;
} {
  const poolMap = new Map<string, { song: PromptSong; at: Date }>();
  const snapshotLookup = new Map<string, import("@moc/contracts").SongSnapshot>();

  for (const s of swipeDocs) {
    const key = `snap:${s.snapshotHash}`;
    snapshotLookup.set(key, s.snapshot);
    if (s.direction !== "right") continue;
    const at = s.at instanceof Date ? s.at : new Date(s.at);
    const existing = poolMap.get(key);
    if (!existing || at > existing.at) {
      poolMap.set(key, {
        song: {
          songKey: key,
          title: s.snapshot.title,
          artist: s.snapshot.artist,
          kind: s.snapshot.kind,
        },
        at,
      });
    }
  }

  for (const score of scoreDocs) {
    snapshotLookup.set(score.songKey, score.snapshot);
    if (score.lastEventType !== "saved" && score.lastEventType !== "completed") continue;
    const at = score.lastEventAt instanceof Date ? score.lastEventAt : new Date(score.lastEventAt);
    const existing = poolMap.get(score.songKey);
    if (!existing || at > existing.at) {
      poolMap.set(score.songKey, {
        song: {
          songKey: score.songKey,
          title: score.snapshot.title,
          artist: score.snapshot.artist,
          kind: score.snapshot.kind,
        },
        at,
      });
    }
  }

  // Returns the FULL newest-first positive-signal pool. The MAX_BUCKET_SONGS
  // cap is applied later by `selectUnbucketedPool` AFTER filtering out
  // already-scored songKeys — otherwise bucketed entries near the top would
  // steal slots from unbucketed entries further down.
  const pool = [...poolMap.values()]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .map(({ song }) => song);

  return { pool, snapshotLookup };
}

function errToString(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  return String(err);
}
