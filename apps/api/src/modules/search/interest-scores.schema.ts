import { Schema, Document } from "mongoose";
import type { SongSnapshot } from "@moc/contracts";

export const INTEREST_SCORES_MODEL = "InterestScores";

export interface InterestScoresDocument extends Document {
  userId: string;
  source: string;
  externalId: string;
  songKey: string;
  snapshot: SongSnapshot;
  score: number;
  firstEventType: "explored" | "saved";
  lastEventType: "explored" | "saved";
  firstEventAt: Date;
  lastEventAt: Date;
}

const SongSnapshotSubSchema = new Schema<SongSnapshot>(
  {
    title: { type: String, required: true },
    artist: { type: String, required: true },
    coverUrl: { type: String },
    year: { type: Number },
    durationSec: { type: Number },
    kind: { type: String, enum: ["track", "station"], required: true },
  },
  { _id: false },
);

export const InterestScoresSchemaDefinition = new Schema<InterestScoresDocument>(
  {
    userId: { type: String, required: true },
    source: { type: String, required: true },
    externalId: { type: String, required: true },
    songKey: { type: String, required: true },
    snapshot: { type: SongSnapshotSubSchema, required: true },
    score: { type: Number, required: true },
    firstEventType: { type: String, enum: ["explored", "saved"], required: true },
    lastEventType: { type: String, enum: ["explored", "saved"], required: true },
    firstEventAt: { type: Date, required: true },
    lastEventAt: { type: Date, required: true },
  },
  { collection: "interest_scores", versionKey: false },
);

// Unique compound index — one document per (userId, songKey) — DATA-05
InterestScoresSchemaDefinition.index({ userId: 1, songKey: 1 }, { unique: true });
