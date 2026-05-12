import { Schema, Document } from "mongoose";

export const RESOLUTION_PREFERENCES_MODEL = "ResolutionPreferences";

export interface ResolutionPreferencesDocument extends Document {
  snapshotHash: string;
  source: "soundcloud";
  sourceTrackId: string;
  sourceLocator: string;
  score: number;
  chosenAt: Date;
}

export const ResolutionPreferencesSchemaDefinition = new Schema<ResolutionPreferencesDocument>(
  {
    snapshotHash: { type: String, required: true, index: true },
    source: { type: String, required: true, enum: ["soundcloud"] },
    sourceTrackId: { type: String, required: true },
    sourceLocator: { type: String, required: true },
    score: { type: Number, required: true, min: 1 },
    chosenAt: { type: Date, required: true },
  },
  { collection: "resolution_preferences", versionKey: false },
);

// DATA-14: (snapshotHash, source, sourceTrackId) is a unique compound
// index. Prevents the same track from being added to a song's preferences
// more than once (which would also let two rows tie on score).
ResolutionPreferencesSchemaDefinition.index(
  { snapshotHash: 1, source: 1, sourceTrackId: 1 },
  { unique: true },
);

// DATA-14 explicitly bans a TTL index on this collection — preferences
// persist forever, unlike play_resolutions (DATA-08) which is a 24h cache.
