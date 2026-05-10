import { Inject, Injectable } from "@nestjs/common";
import type { SongSnapshot, SwipeDirection } from "@moc/contracts";
import { computeSnapshotHash } from "@moc/api-core";
import { SwipesRepository } from "./explore.repository.js";
import { InterestScoresRepository } from "../search/interest-scores.repository.js";

interface RecordSwipeInput {
  userId: string;
  snapshot: SongSnapshot;
  direction: SwipeDirection;
}

@Injectable()
export class ExploreService {
  constructor(
    @Inject(SwipesRepository) private readonly swipes: SwipesRepository,
    @Inject(InterestScoresRepository)
    private readonly interestScores: InterestScoresRepository,
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
  }
}
