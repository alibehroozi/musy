import { Schema, Document } from "mongoose";
import type { BucketKind, BucketState } from "@moc/contracts";

export const BUCKETS_MODEL = "Buckets";

export interface BucketsDocument extends Document {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  kind: BucketKind;
  state: BucketState;
  promptText: string | null;
  errorReason: string | null;
  createdAt: Date;
  lastBuiltAt: Date;
}

export const BucketsSchemaDefinition = new Schema<BucketsDocument>(
  {
    id: { type: String, required: true },
    userId: { type: String, required: true },
    name: { type: String, required: true, maxlength: 60 },
    description: { type: String, default: null, maxlength: 200 },
    kind: { type: String, required: true, enum: ["auto", "custom"] },
    state: { type: String, required: true, enum: ["ready", "building", "failed"] },
    promptText: { type: String, default: null },
    errorReason: { type: String, default: null },
    createdAt: { type: Date, required: true },
    lastBuiltAt: { type: Date, required: true },
  },
  { collection: "buckets", versionKey: false },
);

// DATA-15:
// (userId, id)    — scoped reads by id (every read filters by the session's userId).
// (userId, state) — polling read-path for buckets currently in `building` state.
BucketsSchemaDefinition.index({ userId: 1, id: 1 });
BucketsSchemaDefinition.index({ userId: 1, state: 1 });
