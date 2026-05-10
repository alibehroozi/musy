import { Schema, Document } from "mongoose";
import type { SongSnapshot, SwipeDirection } from "@moc/contracts";

export const SWIPES_MODEL = "Swipes";

export interface SwipesDocument extends Document {
  userId: string;
  snapshot: SongSnapshot;
  snapshotHash: string;
  direction: SwipeDirection;
  at: Date;
}

export const SwipesSchemaDefinition = new Schema<SwipesDocument>(
  {
    userId: { type: String, required: true },
    snapshot: { type: Schema.Types.Mixed, required: true },
    snapshotHash: { type: String, required: true },
    direction: { type: String, required: true, enum: ["right", "left"] },
    at: { type: Date, required: true },
  },
  { collection: "swipes", versionKey: false },
);

// Compound indexes — DATA-10.
// (userId, at)         — newest-first reads ordered by recency.
// (userId, snapshotHash) — duplicate-suppression queries used by features 4 / 5.
SwipesSchemaDefinition.index({ userId: 1, at: 1 });
SwipesSchemaDefinition.index({ userId: 1, snapshotHash: 1 });
