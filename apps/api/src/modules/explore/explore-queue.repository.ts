import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import type { QueuePhase, SongSnapshot } from "@moc/contracts";
import { EXPLORE_QUEUE_MODEL, type ExploreQueueDocument } from "./explore-queue.schema.js";

export interface ExploreQueueInput {
  id: string;
  userId: string;
  items: SongSnapshot[];
  phase: QueuePhase;
  generatedAt: Date;
  swipesSeenAtBuild: number;
}

@Injectable()
export class ExploreQueueRepository {
  constructor(
    @InjectModel(EXPLORE_QUEUE_MODEL)
    private readonly model: Model<ExploreQueueDocument>,
  ) {}

  /** SEC-11: every read scoped by the authenticated session's userId. */
  async findForUser(userId: string): Promise<ExploreQueueDocument | null> {
    return this.model.findOne({ userId }).lean().exec() as unknown as ExploreQueueDocument | null;
  }

  /**
   * Replace-wholesale upsert per DATA-12. The unique (userId) index
   * enforces "one queue per user"; the queue grows / shrinks via
   * fresh writes here, never via $push / $pull.
   */
  async upsertForUser(input: ExploreQueueInput): Promise<void> {
    await this.model
      .updateOne(
        { userId: input.userId },
        {
          $set: {
            id: input.id,
            userId: input.userId,
            items: input.items,
            phase: input.phase,
            generatedAt: input.generatedAt,
            swipesSeenAtBuild: input.swipesSeenAtBuild,
          },
        },
        { upsert: true },
      )
      .exec();
  }
}
