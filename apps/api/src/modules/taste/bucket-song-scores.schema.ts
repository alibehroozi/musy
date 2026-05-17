import { Schema, Document } from "mongoose";
import type { SongSnapshot } from "@moc/contracts";

export const BUCKET_SONG_SCORES_MODEL = "BucketSongScores";

export interface BucketSongScoresDocument extends Document {
  userId: string;
  bucketId: string;
  songKey: string;
  snapshot: SongSnapshot;
  score: number;
  lastUpdatedAt: Date;
}

export const BucketSongScoresSchemaDefinition = new Schema<BucketSongScoresDocument>(
  {
    userId: { type: String, required: true },
    bucketId: { type: String, required: true },
    songKey: { type: String, required: true },
    snapshot: { type: Schema.Types.Mixed, required: true },
    score: { type: Number, required: true, min: 0, max: 100, validate: Number.isInteger },
    lastUpdatedAt: { type: Date, required: true },
  },
  { collection: "bucket_song_scores", versionKey: false },
);

// DATA-16:
// Unique (userId, bucketId, songKey) — one score per song per bucket per user.
// (userId, bucketId, score: -1)      — top-N reads for bucket cover and ordered song list.
BucketSongScoresSchemaDefinition.index({ userId: 1, bucketId: 1, songKey: 1 }, { unique: true });
BucketSongScoresSchemaDefinition.index({ userId: 1, bucketId: 1, score: -1 });
