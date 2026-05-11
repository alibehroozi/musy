import { Schema, Document } from "mongoose";
import type { QueuePhase, SongSnapshot } from "@moc/contracts";

export const EXPLORE_QUEUE_MODEL = "ExploreQueue";

export interface ExploreQueueDocument extends Document {
  id: string;
  userId: string;
  items: SongSnapshot[];
  phase: QueuePhase;
  generatedAt: Date;
  swipesSeenAtBuild: number;
}

// DATA-13: every persisted item must carry a non-empty coverUrl. The
// SongSnapshot Zod stays optional (other surfaces — interest events,
// saved events, listening — legitimately accept covers later); the
// constraint is enforced at the queue persistence boundary, here.
const QueueItemSchemaDefinition = new Schema<SongSnapshot>(
  {
    title: { type: String, required: true },
    artist: { type: String, required: true },
    coverUrl: {
      type: String,
      required: true,
      validate: {
        validator: (v: unknown) => typeof v === "string" && v.length > 0,
        message: "explore_queue items must have a non-empty coverUrl",
      },
    },
    year: { type: Number },
    durationSec: { type: Number, min: 0 },
    kind: { type: String, required: true, enum: ["track", "station"] },
  },
  { _id: false, versionKey: false },
);

export const ExploreQueueSchemaDefinition = new Schema<ExploreQueueDocument>(
  {
    id: { type: String, required: true },
    userId: { type: String, required: true },
    items: { type: [QueueItemSchemaDefinition], required: true, default: [] },
    phase: {
      type: String,
      required: true,
      enum: ["discovery", "artist-refinement", "personalized"],
    },
    generatedAt: { type: Date, required: true },
    swipesSeenAtBuild: { type: Number, required: true, min: 0 },
  },
  { collection: "explore_queue", versionKey: false },
);

// DATA-12: at most one queue per user; refills replace wholesale.
ExploreQueueSchemaDefinition.index({ userId: 1 }, { unique: true });
