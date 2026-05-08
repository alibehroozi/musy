import { Schema, Document } from "mongoose";
import type { SongSnapshot } from "@moc/contracts";

export const INTEREST_SCORES_MODEL = "InterestScore";

export type InterestEventType = "explored" | "saved" | "completed";

export interface InterestScoreDocument extends Document {
  userId: string;
  songKey: string;
  source: string;
  externalId: string;
  snapshot: SongSnapshot;
  score: number;
  firstEventType: InterestEventType;
  lastEventType: InterestEventType;
  firstEventAt: Date;
  lastEventAt: Date;
}

export const InterestScoreSchemaDefinition = new Schema<InterestScoreDocument>(
  {
    userId: { type: String, required: true },
    songKey: { type: String, required: true },
    source: { type: String, required: true },
    externalId: { type: String, required: true },
    snapshot: { type: Schema.Types.Mixed, required: true },
    score: { type: Number, required: true, min: 0 },
    firstEventType: { type: String, required: true },
    lastEventType: { type: String, required: true },
    firstEventAt: { type: Date, required: true },
    lastEventAt: { type: Date, required: true },
  },
  { collection: "interest_scores", versionKey: false },
);

InterestScoreSchemaDefinition.index({ userId: 1, songKey: 1 }, { unique: true });
