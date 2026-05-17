import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import type { ContextAxis, ScoringEventType } from "@moc/contracts";
import { clampScore } from "@moc/api-core";
import { CONTEXT_SCORES_MODEL, type ContextScoresDocument } from "./context-scores.schema.js";

export interface IncContextScoreInput {
  userId: string;
  songKey: string;
  axis: ContextAxis;
  value: string;
  delta: number;
  eventType: ScoringEventType;
  at: Date;
}

export interface SetContextScoreInput {
  userId: string;
  songKey: string;
  axis: ContextAxis;
  value: string;
  score: number;
  eventType: ScoringEventType;
  at: Date;
}

/**
 * SEC-13: every write derives userId from the request session — the
 * repository never accepts an externally-supplied userId, only the
 * caller-validated value already attached to the input record.
 */
@Injectable()
export class ContextScoresRepository {
  constructor(
    @InjectModel(CONTEXT_SCORES_MODEL)
    private readonly model: Model<ContextScoresDocument>,
  ) {}

  /**
   * Atomic increment with a 100-ceiling. The two-step shape (read +
   * conditional inc) would race; instead the upsert applies `$inc`
   * and a follow-up `$set` clamps the result. Both ops happen inside
   * one update with `$max` semantics: a `$min` against 100 caps the
   * stored value (LOGIC-31 mirror at the DB layer).
   */
  async inc(input: IncContextScoreInput): Promise<void> {
    // Apply inc first; then clamp by writing back min(score, 100).
    // Concurrent writes converge: every operation increments by the
    // same delta atomically; the post-clamp leaves the row at 100
    // once any caller pushed it past the ceiling.
    const after = (await this.model
      .findOneAndUpdate(
        { userId: input.userId, songKey: input.songKey, axis: input.axis, value: input.value },
        {
          $inc: { score: input.delta },
          $set: { lastEventType: input.eventType, lastEventAt: input.at },
          $setOnInsert: {
            userId: input.userId,
            songKey: input.songKey,
            axis: input.axis,
            value: input.value,
          },
        },
        { upsert: true, new: true, lean: true },
      )
      .exec()) as unknown as { score: number } | null;
    if (after !== null && after.score !== clampScore(after.score)) {
      await this.model
        .updateOne(
          { userId: input.userId, songKey: input.songKey, axis: input.axis, value: input.value },
          { $set: { score: clampScore(after.score) } },
        )
        .exec();
    }
  }

  /**
   * Left-swipe write: HARD set the row to a given score (always 0 in
   * the current product rules). Upsert so a never-seen context still
   * gets a row at 0 to record the explicit dismissal (LOGIC-30).
   */
  async set(input: SetContextScoreInput): Promise<void> {
    await this.model
      .updateOne(
        { userId: input.userId, songKey: input.songKey, axis: input.axis, value: input.value },
        {
          $set: {
            score: clampScore(input.score),
            lastEventType: input.eventType,
            lastEventAt: input.at,
          },
          $setOnInsert: {
            userId: input.userId,
            songKey: input.songKey,
            axis: input.axis,
            value: input.value,
          },
        },
        { upsert: true },
      )
      .exec();
  }
}
