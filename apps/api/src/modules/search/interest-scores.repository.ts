import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import type { InterestEventType, ProviderName, SongSnapshot } from "@moc/contracts";
import { applyInterestEvent, songKeyOf } from "@moc/api-core";
import { INTEREST_SCORES_MODEL, type InterestScoresDocument } from "./interest-scores.schema.js";

interface UpsertEventInput {
  userId: string;
  source: ProviderName;
  externalId: string;
  snapshot: SongSnapshot;
  eventType: InterestEventType;
}

@Injectable()
export class InterestScoresRepository {
  constructor(
    @InjectModel(INTEREST_SCORES_MODEL) private readonly model: Model<InterestScoresDocument>,
  ) {}

  /**
   * Upsert an event for (userId, source, externalId).
   *
   * Reads the current document (if any), computes the new score via
   * the pure max-rule, and writes back via $set (always-updated
   * lastEvent* fields) plus $setOnInsert (snapshot + first-event
   * fields written exactly once — DATA-07).
   */
  async upsertEvent(input: UpsertEventInput): Promise<void> {
    const { userId, source, externalId, snapshot, eventType } = input;
    const songKey = songKeyOf(source, externalId);

    const existing = await this.model.findOne({ userId, songKey }).lean().exec();
    const { score: nextScore } = applyInterestEvent(existing?.score ?? null, eventType);

    const now = new Date();
    await this.model
      .findOneAndUpdate(
        { userId, songKey },
        {
          $setOnInsert: {
            userId,
            source,
            externalId,
            songKey,
            snapshot,
            firstEventType: eventType,
            firstEventAt: now,
          },
          $set: {
            score: nextScore,
            lastEventType: eventType,
            lastEventAt: now,
          },
        },
        { upsert: true, new: true },
      )
      .lean()
      .exec();
  }

  /** SEC-06: every read is scoped by the authenticated session's userId. */
  async findScoresForUser(userId: string): Promise<InterestScoresDocument[]> {
    return this.model.find({ userId }).lean().exec() as unknown as InterestScoresDocument[];
  }
}
