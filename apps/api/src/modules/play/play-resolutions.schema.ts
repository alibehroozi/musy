import { Schema, Document } from "mongoose";
import type { SongSnapshot, ResolveSource } from "@moc/contracts";

export const PLAY_RESOLUTIONS_MODEL = "PlayResolutions";

export interface PlayResolutionsDocument extends Document {
  snapshotHash: string;
  snapshot: SongSnapshot;
  source: ResolveSource | null;
  sourceTrackId: string | null;
  sourceLocator: string | null;
  resolvedAt: Date;
  expiresAt: Date;
}

export const PlayResolutionsSchemaDefinition = new Schema<PlayResolutionsDocument>(
  {
    snapshotHash: { type: String, required: true, unique: true, index: true },
    snapshot: { type: Schema.Types.Mixed, required: true },
    source: { type: String, required: false, default: null },
    sourceTrackId: { type: String, required: false, default: null },
    sourceLocator: { type: String, required: false, default: null },
    resolvedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
  },
  { collection: "play_resolutions", versionKey: false },
);

// TTL index — DATA-08
PlayResolutionsSchemaDefinition.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
