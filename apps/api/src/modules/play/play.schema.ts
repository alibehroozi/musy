import { Schema, Document } from "mongoose";
import type { SongSnapshot } from "@moc/contracts";

export const PLAY_RESOLUTION_MODEL = "PlayResolution";

export const RESOLUTION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface PlayResolutionDocument extends Document {
  snapshotHash: string;
  snapshot: SongSnapshot;
  source: "audius" | "soundcloud" | null;
  sourceTrackId: string | null;
  resolvedAt: Date;
  expiresAt: Date;
}

export const PlayResolutionSchemaDefinition = new Schema<PlayResolutionDocument>(
  {
    snapshotHash: { type: String, required: true, unique: true, index: true },
    snapshot: { type: Schema.Types.Mixed, required: true },
    source: { type: String, default: null },
    sourceTrackId: { type: String, default: null },
    resolvedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
  },
  { collection: "play_resolutions", versionKey: false },
);

PlayResolutionSchemaDefinition.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
