import { Schema, Document } from "mongoose";

export const CUSTOM_MIX_JOBS_MODEL = "CustomMixJobs";

export type CustomMixJobState = "building" | "completed" | "failed";

export interface CustomMixJobsDocument extends Document {
  jobId: string;
  userId: string;
  bucketId: string;
  promptText: string;
  state: CustomMixJobState;
  errorReason: string | null;
  sourceBuckets: Map<string, string[]> | null;
  startedAt: Date;
  completedAt: Date | null;
}

export const CustomMixJobsSchemaDefinition = new Schema<CustomMixJobsDocument>(
  {
    jobId: { type: String, required: true, unique: true },
    userId: { type: String, required: true },
    bucketId: { type: String, required: true },
    promptText: { type: String, required: true, maxlength: 500 },
    state: { type: String, required: true, enum: ["building", "completed", "failed"] },
    errorReason: { type: String, default: null },
    sourceBuckets: { type: Map, of: [String], default: null },
    startedAt: { type: Date, required: true },
    completedAt: { type: Date, default: null },
  },
  { collection: "custom_mix_jobs", versionKey: false },
);

// DATA-19:
// (jobId)         — unique; declared on the path itself via `unique: true`
//                   above, so a separate `schema.index` call would only
//                   produce a duplicate-index warning at boot.
// (userId, state) — rate-limit guard counts in-flight jobs per user cheaply.
CustomMixJobsSchemaDefinition.index({ userId: 1, state: 1 });
