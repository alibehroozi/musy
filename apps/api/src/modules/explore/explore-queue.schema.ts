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

export const ExploreQueueSchemaDefinition = new Schema<ExploreQueueDocument>(
  {
    id: { type: String, required: true },
    userId: { type: String, required: true },
    items: { type: Schema.Types.Mixed, required: true, default: [] },
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
