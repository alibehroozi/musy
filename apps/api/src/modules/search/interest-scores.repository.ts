import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import type { InterestEventType, ProviderName, SongSnapshot } from "@moc/contracts";
import { applyInterestEvent, computeSnapshotHash, songKeyOf } from "@moc/api-core";
import { INTEREST_SCORES_MODEL, type InterestScoresDocument } from "./interest-scores.schema.js";

interface UpsertEventInput {
  userId: string;
  source: ProviderName;
  externalId: string;
  snapshot: SongSnapshot;
  eventType: InterestEventType;
}

interface UpsertSnapshotEventInput {
  userId: string;
  snapshot: SongSnapshot;
  eventType: InterestEventType;
}

interface ApplyUpsertInput {
  userId: string;
  songKey: string;
  source?: ProviderName;
  externalId?: string;
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
    await this.applyUpsert({
      userId: input.userId,
      songKey: songKeyOf(input.source, input.externalId),
      source: input.source,
      externalId: input.externalId,
      snapshot: input.snapshot,
      eventType: input.eventType,
    });
  }

  /**
   * Snapshot-keyed upsert for the Explore swipe path. The swipe body
   * carries only a snapshot — no provider source / externalId — so
   * identity is derived from computeSnapshotHash (LOGIC-05) and stored
   * under the namespaced songKey "snap:<hash>". Same DATA-06 / DATA-07
   * guarantees as upsertEvent (max-rule, snapshot frozen on first event).
   */
  async upsertEventBySnapshot(input: UpsertSnapshotEventInput): Promise<void> {
    const snapshotHash = computeSnapshotHash(input.snapshot);
    await this.applyUpsert({
      userId: input.userId,
      songKey: `snap:${snapshotHash}`,
      snapshot: input.snapshot,
      eventType: input.eventType,
    });
  }

  /** SEC-06: every read is scoped by the authenticated session's userId. */
  async findScoresForUser(userId: string): Promise<InterestScoresDocument[]> {
    return this.model.find({ userId }).lean().exec() as unknown as InterestScoresDocument[];
  }

  /**
   * Sample up to `count` documents for this user whose `score` falls in
   * `[minScore, maxScore]` (inclusive). Returns fewer if the bucket has
   * fewer matching entries. Used by QueueBuilderService.sourcePersonalized
   * to surface a random slice of the user's already-rated history at
   * three score tiers, which the LLM consumes as context (LOGIC-25).
   *
   * SEC-06: every read is scoped by the authenticated session's userId.
   * Uses Mongo's $sample aggregation operator for uniform random selection
   * server-side (no in-memory load-and-pick of the full collection).
   */
  async sampleByScoreBucket(
    userId: string,
    minScore: number,
    maxScore: number,
    count: number,
  ): Promise<InterestScoresDocument[]> {
    if (count <= 0) return [];
    const docs = await this.model
      .aggregate([
        { $match: { userId, score: { $gte: minScore, $lte: maxScore } } },
        { $sample: { size: count } },
      ])
      .exec();
    return docs as unknown as InterestScoresDocument[];
  }

  private async applyUpsert(input: ApplyUpsertInput): Promise<void> {
    const existing = await this.model
      .findOne({ userId: input.userId, songKey: input.songKey })
      .lean()
      .exec();
    const { score: nextScore } = applyInterestEvent(existing?.score ?? null, input.eventType);

    const now = new Date();
    const setOnInsert: Record<string, unknown> = {
      userId: input.userId,
      songKey: input.songKey,
      snapshot: input.snapshot,
      firstEventType: input.eventType,
      firstEventAt: now,
    };
    if (input.source !== undefined) setOnInsert["source"] = input.source;
    if (input.externalId !== undefined) setOnInsert["externalId"] = input.externalId;

    await this.model
      .findOneAndUpdate(
        { userId: input.userId, songKey: input.songKey },
        {
          $setOnInsert: setOnInsert,
          $set: {
            score: nextScore,
            lastEventType: input.eventType,
            lastEventAt: now,
          },
        },
        { upsert: true, new: true },
      )
      .lean()
      .exec();
  }
}
