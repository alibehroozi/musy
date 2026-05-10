import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import type { SongSnapshot, SwipeDirection } from "@moc/contracts";
import { computeSnapshotHash } from "@moc/api-core";
import { SwipesRepository } from "./explore.repository.js";
import { InterestScoresRepository } from "../search/interest-scores.repository.js";
import { ProfileBuilderService } from "./profile-builder.service.js";
import { QueueBuilderService } from "./queue-builder.service.js";

interface RecordSwipeInput {
  userId: string;
  snapshot: SongSnapshot;
  direction: SwipeDirection;
}

@Injectable()
export class ExploreService {
  private readonly logger = new Logger(ExploreService.name);

  constructor(
    @Inject(SwipesRepository) private readonly swipes: SwipesRepository,
    @Inject(InterestScoresRepository)
    private readonly interestScores: InterestScoresRepository,
    @Optional()
    @Inject(ProfileBuilderService)
    private readonly profileBuilder?: ProfileBuilderService,
    @Optional()
    @Inject(QueueBuilderService)
    private readonly queueBuilder?: QueueBuilderService,
  ) {}

  /**
   * Persist one swipe:
   *   1. Append a row to swipes (always — every swipe preserved as the
   *      authoritative record, including left-swipes which only live here).
   *   2. For right-swipes only: bump interest_scores via the snapshot-keyed
   *      upsert. Right-swipe is treated as a "saved" event (LOGIC-14 maps
   *      "swiped_right" to floor 8, equivalent to the search-row save).
   *      Left-swipes intentionally do not write to interest_scores — the
   *      score is positive-only; the ledger captures the rejection.
   *   3. Enqueue a taste-profile rebuild check (fire-and-forget). The
   *      builder is @Optional so test harnesses that wire only the swipe
   *      surface (without an Anthropic client) keep working.
   */
  async recordSwipe(input: RecordSwipeInput): Promise<void> {
    const snapshotHash = computeSnapshotHash(input.snapshot);
    await this.swipes.record({
      userId: input.userId,
      snapshot: input.snapshot,
      snapshotHash,
      direction: input.direction,
    });
    if (input.direction === "right") {
      await this.interestScores.upsertEventBySnapshot({
        userId: input.userId,
        snapshot: input.snapshot,
        eventType: "saved",
      });
    }
    if (this.profileBuilder) {
      void this.profileBuilder.maybeBuild(input.userId).catch((err) => {
        this.logger.error(
          { event: "taste_profile_enqueue_failed", err: errToString(err) },
          "taste_profile_enqueue_failed",
        );
      });
    }
    // Spec: after each swipe write, check the queue length; if < 5 trigger
    // an async refill. Same fire-and-forget posture as the profile builder.
    if (this.queueBuilder) {
      void this.queueBuilder.maybeRefill(input.userId).catch((err) => {
        this.logger.error(
          { event: "explore_queue_refill_enqueue_failed", err: errToString(err) },
          "explore_queue_refill_enqueue_failed",
        );
      });
    }
  }
}

function errToString(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  return String(err);
}
