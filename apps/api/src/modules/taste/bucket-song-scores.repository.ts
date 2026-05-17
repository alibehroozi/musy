import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { clampScore } from "@moc/api-core";
import {
  BUCKET_SONG_SCORES_MODEL,
  type BucketSongScoresDocument,
} from "./bucket-song-scores.schema.js";

export interface BucketAxisDelta {
  userId: string;
  bucketId: string;
  songKey: string;
  delta: number;
  at: Date;
}

/**
 * Repository for the `bucket_song_scores` collection.
 *
 * Feature 01 locked the schema + indexes; feature 02 introduces the
 * write side — the bucket-axis arm of the contextual-scoring system
 * bumps every `(userId, songKey)` row that already exists. Before
 * feature 04 lands no bucket-membership rows exist, so the write is a
 * no-op; once buckets get populated the same code path lights up
 * without further change.
 */
@Injectable()
export class BucketSongScoresRepository {
  constructor(
    @InjectModel(BUCKET_SONG_SCORES_MODEL)
    private readonly model: Model<BucketSongScoresDocument>,
  ) {}

  /** SEC-12: every read is filtered by the authenticated session's userId. */
  async findForUserBucket(userId: string, bucketId: string): Promise<BucketSongScoresDocument[]> {
    return this.model
      .find({ userId, bucketId })
      .sort({ score: -1 })
      .lean()
      .exec() as unknown as BucketSongScoresDocument[];
  }

  /**
   * SEC-16: all rows for the user across every bucket. Used by the
   * custom-mix prompt builder to compute the per-song `generalScore`
   * (LOGIC-32) without re-issuing per-song queries.
   */
  async findScoresForUser(userId: string): Promise<BucketSongScoresDocument[]> {
    return (await this.model
      .find({ userId })
      .lean()
      .exec()) as unknown as BucketSongScoresDocument[];
  }

  /**
   * SEC-13: scoped to the caller's userId. Returns the bucketIds the
   * song already belongs to, so the scoring service knows which
   * (userId, bucketId, songKey) rows to bump.
   */
  async findBucketIdsForSong(userId: string, songKey: string): Promise<string[]> {
    const rows = (await this.model
      .find({ userId, songKey }, { bucketId: 1 })
      .lean()
      .exec()) as unknown as { bucketId: string }[];
    return rows.map((r) => r.bucketId);
  }

  /**
   * Insert-only score seeding per LOGIC-34. On the first insert the
   * LLM-supplied initialScore (already clamped by the caller) is
   * written; if the row already exists its score is left entirely
   * untouched — only the first-time assignment seeds the value.
   *
   * SEC-15: userId comes from the caller (never from LLM output).
   */
  async insertInitialScore(input: {
    userId: string;
    bucketId: string;
    songKey: string;
    snapshot: import("@moc/contracts").SongSnapshot;
    initialScore: number;
    at: Date;
  }): Promise<void> {
    await this.model
      .findOneAndUpdate(
        { userId: input.userId, bucketId: input.bucketId, songKey: input.songKey },
        {
          $setOnInsert: {
            userId: input.userId,
            bucketId: input.bucketId,
            songKey: input.songKey,
            snapshot: input.snapshot,
            score: input.initialScore,
            lastUpdatedAt: input.at,
          },
        },
        { upsert: true, new: false },
      )
      .exec();
  }

  /**
   * Atomic increment with [0, 100] clamping at the application layer.
   * Mirrors ContextScoresRepository.inc — apply $inc, then clamp.
   * `delta` may be negative (feature 06 skip-in-mix), so the clamp
   * also catches values dropping below 0.
   */
  async inc(input: BucketAxisDelta): Promise<void> {
    const after = (await this.model
      .findOneAndUpdate(
        { userId: input.userId, bucketId: input.bucketId, songKey: input.songKey },
        {
          $inc: { score: input.delta },
          $set: { lastUpdatedAt: input.at },
        },
        { new: true, lean: true },
      )
      .exec()) as unknown as { score: number } | null;
    if (after !== null && after.score !== clampScore(after.score)) {
      await this.model
        .updateOne(
          { userId: input.userId, bucketId: input.bucketId, songKey: input.songKey },
          { $set: { score: clampScore(after.score) } },
        )
        .exec();
    }
  }
}
