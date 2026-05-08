import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import type { ExploredEventRequest, SavedEventRequest } from "@moc/contracts";
import { applyInterestEvent, type InterestEventType } from "@moc/api-core";
import { INTEREST_SCORES_MODEL, type InterestScoresDocument } from "./interest-scores.schema.js";

type InterestEventBody = ExploredEventRequest | SavedEventRequest;

@Injectable()
export class InterestScoresRepository {
  constructor(
    @InjectModel(INTEREST_SCORES_MODEL) private readonly model: Model<InterestScoresDocument>,
  ) {}

  async recordEvent(
    userId: string,
    eventType: InterestEventType,
    body: InterestEventBody,
  ): Promise<void> {
    const songKey = `${body.source}:${body.externalId}`;
    const now = new Date();

    const existing = await this.model.findOne({ userId, songKey }).lean().exec();

    const { score } = applyInterestEvent(existing?.score ?? null, eventType);

    await this.model
      .findOneAndUpdate(
        { userId, songKey },
        {
          $setOnInsert: {
            source: body.source,
            externalId: body.externalId,
            snapshot: body.snapshot,
            firstEventType: eventType,
            firstEventAt: now,
          },
          $set: {
            score,
            lastEventType: eventType,
            lastEventAt: now,
          },
        },
        { upsert: true, new: true },
      )
      .lean()
      .exec();
  }
}
