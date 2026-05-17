import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import {
  BUCKET_SONG_SCORES_MODEL,
  type BucketSongScoresDocument,
} from "./bucket-song-scores.schema.js";

/**
 * Placeholder repository for the `bucket_song_scores` collection.
 *
 * Feature 01 only locks the schema + indexes; the read / write surfaces
 * land with features 04 (auto-bucket builder) and 08 (bucket detail).
 * The repository ships now so the Mongoose model is registered at
 * boot and the indexes get created against the live DB — without it
 * the unique (userId, bucketId, songKey) index wouldn't exist on the
 * collection until the first downstream feature shipped.
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
}
