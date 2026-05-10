import { Schema, Document } from "mongoose";
import type { ProviderName, SongSnapshot, InterestEventType } from "@moc/contracts";

export const INTEREST_SCORES_MODEL = "InterestScores";

export interface InterestScoresDocument extends Document {
  userId: string;
  source: ProviderName;
  externalId: string;
  songKey: string;
  snapshot: SongSnapshot;
  score: number;
  firstEventType: InterestEventType;
  lastEventType: InterestEventType;
  firstEventAt: Date;
  lastEventAt: Date;
}

export const InterestScoresSchemaDefinition = new Schema<InterestScoresDocument>(
  {
    userId: { type: String, required: true },
    source: { type: String, required: true },
    externalId: { type: String, required: true },
    songKey: { type: String, required: true },
    snapshot: { type: Schema.Types.Mixed, required: true },
    score: { type: Number, required: true, min: 1, max: 10 },
    firstEventType: { type: String, required: true, enum: ["explored", "completed", "saved"] },
    lastEventType: { type: String, required: true, enum: ["explored", "completed", "saved"] },
    firstEventAt: { type: Date, required: true },
    lastEventAt: { type: Date, required: true },
  },
  { collection: "interest_scores", versionKey: false },
);

// Unique compound index — one document per (userId, songKey). DATA-05.
InterestScoresSchemaDefinition.index({ userId: 1, songKey: 1 }, { unique: true });
