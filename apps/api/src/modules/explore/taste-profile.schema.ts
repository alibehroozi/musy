import { Schema, Document } from "mongoose";
import type { RemixPreference, TempoBucket } from "@moc/contracts";

export const TASTE_PROFILES_MODEL = "TasteProfiles";

export interface RankedItemDoc {
  name: string;
  score: number;
}

export interface TasteProfileDocument extends Document {
  id: string;
  userId: string;
  genres: RankedItemDoc[];
  artists: RankedItemDoc[];
  tempoBucket: TempoBucket | null;
  remixPreference: RemixPreference | null;
  summaryText: string;
  lastBuiltAt: Date;
  swipeCountAtLastBuild: number;
}

const RankedItemSchema = new Schema<RankedItemDoc>(
  {
    name: { type: String, required: true },
    score: { type: Number, required: true, min: 0, max: 1 },
  },
  { _id: false, versionKey: false },
);

export const TasteProfilesSchemaDefinition = new Schema<TasteProfileDocument>(
  {
    id: { type: String, required: true },
    userId: { type: String, required: true },
    genres: { type: [RankedItemSchema], required: true, default: [] },
    artists: { type: [RankedItemSchema], required: true, default: [] },
    tempoBucket: { type: String, enum: ["slow", "mid", "fast", null], default: null },
    remixPreference: {
      type: String,
      enum: ["original", "remix-friendly", "remix-only", null],
      default: null,
    },
    summaryText: { type: String, required: true, default: "" },
    lastBuiltAt: { type: Date, required: true },
    swipeCountAtLastBuild: { type: Number, required: true, min: 0 },
  },
  { collection: "taste_profiles", versionKey: false },
);

// DATA-11: at most one profile per user.
TasteProfilesSchemaDefinition.index({ userId: 1 }, { unique: true });
