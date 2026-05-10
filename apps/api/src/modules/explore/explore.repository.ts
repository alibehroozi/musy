import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import type { SongSnapshot, SwipeDirection } from "@moc/contracts";
import { SWIPES_MODEL, type SwipesDocument } from "./explore.schema.js";

export interface SwipeInput {
  userId: string;
  snapshot: SongSnapshot;
  snapshotHash: string;
  direction: SwipeDirection;
}

@Injectable()
export class SwipesRepository {
  constructor(
    @InjectModel(SWIPES_MODEL)
    private readonly model: Model<SwipesDocument>,
  ) {}

  /**
   * Append-only ledger: every swipe is a fresh document, even when the
   * user repeats the same direction on the same snapshot. Duplicate
   * suppression (for queue-builder / taste-profile features) happens
   * downstream against the (userId, snapshotHash) index.
   */
  async record(input: SwipeInput): Promise<void> {
    await this.model.create({
      userId: input.userId,
      snapshot: input.snapshot,
      snapshotHash: input.snapshotHash,
      direction: input.direction,
      at: new Date(),
    });
  }

  /** SEC-09: every read is scoped by the authenticated session's userId. */
  async findSwipesForUser(userId: string): Promise<SwipesDocument[]> {
    return this.model.find({ userId }).lean().exec() as unknown as SwipesDocument[];
  }
}
