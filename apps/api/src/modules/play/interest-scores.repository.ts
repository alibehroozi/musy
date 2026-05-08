import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import type { SongSnapshot } from "@moc/contracts";
import {
  INTEREST_SCORES_MODEL,
  type InterestEventType,
  type InterestScoreDocument,
} from "./interest-scores.schema.js";

const EVENT_SCORES: Record<"started" | "completed", number> = {
  started: 3,
  completed: 5,
};

@Injectable()
export class InterestScoresRepository {
  constructor(
    @InjectModel(INTEREST_SCORES_MODEL) private readonly model: Model<InterestScoreDocument>,
  ) {}

  async upsert(
    userId: string,
    source: string,
    externalId: string,
    snapshot: SongSnapshot,
    rawEventType: "started" | "completed",
  ): Promise<void> {
    const songKey = `${source}:${externalId}`;
    const interestEventType: InterestEventType =
      rawEventType === "started" ? "explored" : "completed";
    const eventScore = EVENT_SCORES[rawEventType];
    const now = new Date();

    await this.model
      .findOneAndUpdate(
        { userId, songKey },
        {
          $max: { score: eventScore },
          $set: {
            source,
            externalId,
            lastEventType: interestEventType,
            lastEventAt: now,
          },
          $setOnInsert: {
            snapshot,
            firstEventType: interestEventType,
            firstEventAt: now,
          },
        },
        { upsert: true, new: true },
      )
      .lean()
      .exec();
  }
}
