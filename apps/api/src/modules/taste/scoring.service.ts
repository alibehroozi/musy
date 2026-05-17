import { Inject, Injectable, Logger } from "@nestjs/common";
import type { ProviderName, ScoringEventType, SongSnapshot, SwipeDirection } from "@moc/contracts";
import {
  bucketMonth,
  bucketTimeOfDay,
  bucketWeekday,
  computeSnapshotHash,
  scoreDelta,
  songKeyOf,
} from "@moc/api-core";
import { ContextScoresRepository } from "./context-scores.repository.js";
import { BucketSongScoresRepository } from "./bucket-song-scores.repository.js";

interface SwipeInput {
  userId: string;
  snapshot: SongSnapshot;
  direction: SwipeDirection;
}

interface SaveInput {
  userId: string;
  source: ProviderName;
  externalId: string;
}

interface ListenCompletedInput {
  userId: string;
  source: ProviderName;
  externalId: string;
  snapshot: SongSnapshot;
  elapsedMs: number;
}

/**
 * Orchestrates contextual-scoring side effects for the four event
 * types defined in feature 02. Every public method derives the four
 * context axes (weekday / timeOfDay / month) from the event's clock
 * time and dispatches inc / set operations to the repositories. All
 * decisions are delegated to pure helpers (`scoreDelta`, the
 * `bucket*` partitioners) — this class is the only I/O surface.
 *
 * SEC-13: callers always pass session-derived `userId`; the service
 * never accepts a body- or query-supplied identifier.
 */
@Injectable()
export class ScoringService {
  private readonly logger = new Logger(ScoringService.name);

  constructor(
    @Inject(ContextScoresRepository)
    private readonly contextScores: ContextScoresRepository,
    @Inject(BucketSongScoresRepository)
    private readonly bucketSongScores: BucketSongScoresRepository,
  ) {}

  async recordSwipe(input: SwipeInput): Promise<void> {
    const songKey = `snap:${computeSnapshotHash(input.snapshot)}`;
    const eventType: ScoringEventType = input.direction === "right" ? "right-swipe" : "left-swipe";
    await this.apply({
      userId: input.userId,
      songKey,
      eventType,
      affectBucketAxis: input.direction === "right",
    });
  }

  async recordSave(input: SaveInput): Promise<void> {
    const songKey = songKeyOf(input.source, input.externalId);
    await this.apply({
      userId: input.userId,
      songKey,
      eventType: "save",
      affectBucketAxis: true,
    });
  }

  /**
   * Bumps contextual scores only when ≥ 50 % of the track played
   * (the spec's "listen-completed" threshold). Below 50 % the event
   * is a skip — feature 06 handles the decrement for mix context
   * specifically; this feature writes nothing. When the snapshot
   * has no `durationSec`, the percentage cannot be derived and the
   * call is silently skipped (conservative — never overcount).
   */
  async recordListenCompleted(input: ListenCompletedInput): Promise<void> {
    const durationSec = input.snapshot.durationSec;
    if (durationSec === undefined || durationSec <= 0) return;
    const playedPct = input.elapsedMs / (durationSec * 1000);
    if (playedPct < 0.5) return;
    const songKey = songKeyOf(input.source, input.externalId);
    await this.apply({
      userId: input.userId,
      songKey,
      eventType: "listen-completed",
      affectBucketAxis: true,
    });
  }

  private async apply(args: {
    userId: string;
    songKey: string;
    eventType: ScoringEventType;
    affectBucketAxis: boolean;
  }): Promise<void> {
    const now = new Date();
    const delta = scoreDelta(args.eventType);

    const slots = [
      { axis: "weekday" as const, value: bucketWeekday(now) },
      { axis: "timeOfDay" as const, value: bucketTimeOfDay(now) },
      { axis: "month" as const, value: bucketMonth(now) },
    ];

    for (const slot of slots) {
      try {
        if (delta.op === "inc") {
          await this.contextScores.inc({
            userId: args.userId,
            songKey: args.songKey,
            axis: slot.axis,
            value: slot.value,
            delta: delta.delta,
            eventType: args.eventType,
            at: now,
          });
        } else {
          await this.contextScores.set({
            userId: args.userId,
            songKey: args.songKey,
            axis: slot.axis,
            value: slot.value,
            score: delta.value,
            eventType: args.eventType,
            at: now,
          });
        }
      } catch (err) {
        this.logger.error(
          {
            event: "context_score_write_failed",
            axis: slot.axis,
            value: slot.value,
            eventType: args.eventType,
            err: errToString(err),
          },
          "context_score_write_failed",
        );
      }
    }

    // Bucket-axis writes are skipped for left-swipe (rule from the
    // feature spec: a left-swipe downranks the song *in this context*
    // but does NOT remove it from any bucket).
    if (!args.affectBucketAxis || delta.op !== "inc") return;
    try {
      const bucketIds = await this.bucketSongScores.findBucketIdsForSong(args.userId, args.songKey);
      for (const bucketId of bucketIds) {
        await this.bucketSongScores.inc({
          userId: args.userId,
          bucketId,
          songKey: args.songKey,
          delta: delta.delta,
          at: now,
        });
      }
    } catch (err) {
      this.logger.error(
        {
          event: "bucket_score_write_failed",
          eventType: args.eventType,
          err: errToString(err),
        },
        "bucket_score_write_failed",
      );
    }
  }
}

function errToString(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  return String(err);
}
