import { Inject, Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import type { PlayEventType, ProviderName, SongSnapshot } from "@moc/contracts";
import { isSkip, songKeyOf } from "@moc/api-core";
import { ListeningEventsRepository } from "./listening-events.repository.js";
import { InterestScoresRepository } from "../search/interest-scores.repository.js";
import { ScoringService } from "../taste/scoring.service.js";
import { BucketSongScoresRepository } from "../taste/bucket-song-scores.repository.js";
import { CustomMixJobsRepository } from "../taste/custom-mix-jobs.repository.js";

interface RecordEventInput {
  userId: string;
  source: ProviderName;
  externalId: string;
  snapshot: SongSnapshot;
  elapsedMs: number;
  eventType: PlayEventType;
  bucketId?: string | null;
  bucketKind?: "auto" | "custom" | null;
}

interface PendingPlay {
  userId: string;
  bucketId: string;
  songKey: string;
  durationMs: number | null;
  timer: ReturnType<typeof setTimeout> | null;
}

@Injectable()
export class PlayEventsService implements OnModuleDestroy {
  private readonly logger = new Logger(PlayEventsService.name);
  // In-memory session tracking for TTL-based skip detection (LOGIC-37).
  // Key: `${userId}:${source}:${externalId}` — unique per active play.
  private readonly pendingCustomPlays = new Map<string, PendingPlay>();

  constructor(
    @Inject(ListeningEventsRepository)
    private readonly listeningEvents: ListeningEventsRepository,
    @Inject(InterestScoresRepository)
    private readonly interestScores: InterestScoresRepository,
    @Inject(ScoringService) private readonly scoring: ScoringService,
    @Inject(BucketSongScoresRepository)
    private readonly bucketScores: BucketSongScoresRepository,
    @Inject(CustomMixJobsRepository)
    private readonly customMixJobs: CustomMixJobsRepository,
  ) {}

  onModuleDestroy(): void {
    for (const pending of this.pendingCustomPlays.values()) {
      if (pending.timer !== null) clearTimeout(pending.timer);
    }
    this.pendingCustomPlays.clear();
  }

  /**
   * Persist one play event:
   *   1. Append a row to listening_events (always — every event preserved).
   *   2. Bump the matching interest_scores doc via the max-rule:
   *      "started"  → lastEventType "explored" (semantic match, score 3)
   *      "completed" → lastEventType "completed" (score 5)
   *   3. Fire-and-forget contextual-scoring write for `completed` events
   *      that played through ≥ 50 % of the track (feature 02).
   *   4. Skip detection for custom-mix bucket plays (feature 06):
   *      on `started`, register in pending map; on `completed`, resolve.
   */
  async record(input: RecordEventInput): Promise<void> {
    const bucketId = input.bucketId ?? null;
    const bucketKind = input.bucketKind ?? null;

    await this.listeningEvents.record({
      userId: input.userId,
      source: input.source,
      externalId: input.externalId,
      eventType: input.eventType,
      elapsedMs: input.elapsedMs,
      bucketId,
      bucketKind,
    });
    await this.interestScores.upsertEvent({
      userId: input.userId,
      source: input.source,
      externalId: input.externalId,
      snapshot: input.snapshot,
      eventType: input.eventType === "started" ? "explored" : "completed",
    });
    if (input.eventType === "completed") {
      void this.scoring
        .recordListenCompleted({
          userId: input.userId,
          source: input.source,
          externalId: input.externalId,
          snapshot: input.snapshot,
          elapsedMs: input.elapsedMs,
        })
        .catch((err) => {
          this.logger.error(
            { event: "context_score_write_failed", err: errToString(err) },
            "context_score_write_failed",
          );
        });
    }

    const sessionKey = `${input.userId}:${input.source}:${input.externalId}`;

    if (input.eventType === "started" && bucketKind === "custom" && bucketId !== null) {
      this.registerPendingPlay(sessionKey, {
        userId: input.userId,
        bucketId,
        songKey: songKeyOf(input.source, input.externalId),
        durationMs: input.snapshot.durationSec != null ? input.snapshot.durationSec * 1000 : null,
      });
    } else if (input.eventType === "completed") {
      const pending = this.pendingCustomPlays.get(sessionKey);
      if (pending !== undefined) {
        if (pending.timer !== null) clearTimeout(pending.timer);
        this.pendingCustomPlays.delete(sessionKey);
        const durationMs = pending.durationMs ?? input.elapsedMs * 2;
        if (isSkip({ playedMs: input.elapsedMs, durationMs })) {
          void this.applySkipDecrement(pending.userId, pending.bucketId, pending.songKey);
        }
      }
    }
  }

  private registerPendingPlay(sessionKey: string, info: Omit<PendingPlay, "timer">): void {
    const existing = this.pendingCustomPlays.get(sessionKey);
    if (existing?.timer !== null && existing?.timer !== undefined) {
      clearTimeout(existing.timer);
    }

    let timer: ReturnType<typeof setTimeout> | null = null;
    if (info.durationMs !== null) {
      // After durationMs + 60 s, treat missing play_completed as a skip
      // (conservative: if the user closed the tab we assume a skip).
      const ttl = info.durationMs + 60_000;
      timer = setTimeout(() => {
        const pending = this.pendingCustomPlays.get(sessionKey);
        if (pending !== undefined) {
          this.pendingCustomPlays.delete(sessionKey);
          // No completed event arrived — treat as skipped at 0 ms progress.
          void this.applySkipDecrement(pending.userId, pending.bucketId, pending.songKey);
        }
      }, ttl);
    }

    this.pendingCustomPlays.set(sessionKey, { ...info, timer });
  }

  private async applySkipDecrement(
    userId: string,
    bucketId: string,
    songKey: string,
  ): Promise<void> {
    try {
      const job = await this.customMixJobs.findCompletedByBucket(userId, bucketId);
      if (job === null) {
        this.logger.warn(
          { event: "skip_attribution_missing_job_row", userId, bucketId, songKey },
          "skip_attribution_missing_job_row",
        );
        return;
      }

      const sourceBuckets: string[] =
        (job.sourceBuckets as Map<string, string[]> | null)?.get(songKey) ?? [];

      if (sourceBuckets.length === 0) {
        this.logger.warn(
          { event: "skip_attribution_no_source_buckets", userId, bucketId, songKey },
          "skip_attribution_no_source_buckets",
        );
        return;
      }

      const now = new Date();
      await Promise.all(
        sourceBuckets.map((srcBucketId) =>
          this.bucketScores.inc({
            userId,
            bucketId: srcBucketId,
            songKey,
            delta: -15,
            at: now,
          }),
        ),
      );
    } catch (err) {
      this.logger.error(
        { event: "skip_decrement_failed", userId, bucketId, songKey, err: errToString(err) },
        "skip_decrement_failed",
      );
    }
  }
}

function errToString(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  return String(err);
}
