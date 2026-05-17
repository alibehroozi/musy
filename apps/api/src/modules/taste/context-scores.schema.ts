import { Schema, Document } from "mongoose";
import type { ContextAxis, ScoringEventType } from "@moc/contracts";

export const CONTEXT_SCORES_MODEL = "ContextScores";

export interface ContextScoresDocument extends Document {
  userId: string;
  songKey: string;
  axis: ContextAxis;
  value: string;
  score: number;
  lastEventType: ScoringEventType;
  lastEventAt: Date;
}

const AXIS_VALUES: ContextAxis[] = ["weekday", "timeOfDay", "month"];
const EVENT_TYPES: ScoringEventType[] = ["right-swipe", "left-swipe", "save", "listen-completed"];

export const ContextScoresSchemaDefinition = new Schema<ContextScoresDocument>(
  {
    userId: { type: String, required: true },
    songKey: { type: String, required: true },
    axis: { type: String, required: true, enum: AXIS_VALUES },
    value: { type: String, required: true },
    score: { type: Number, required: true, min: 0, max: 100, validate: Number.isInteger },
    lastEventType: { type: String, required: true, enum: EVENT_TYPES },
    lastEventAt: { type: Date, required: true },
  },
  { collection: "context_scores", versionKey: false },
);

// DATA-17:
// Unique (userId, songKey, axis, value) — one score per user / song / context-slot.
// (userId, songKey)                     — read-path that joins all axes for one song.
ContextScoresSchemaDefinition.index({ userId: 1, songKey: 1, axis: 1, value: 1 }, { unique: true });
ContextScoresSchemaDefinition.index({ userId: 1, songKey: 1 });
