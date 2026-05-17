import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import {
  CUSTOM_MIX_JOBS_MODEL,
  type CustomMixJobsDocument,
  type CustomMixJobState,
} from "./custom-mix-jobs.schema.js";

export interface InsertCustomMixJobInput {
  jobId: string;
  userId: string;
  bucketId: string;
  promptText: string;
  startedAt: Date;
}

export interface MarkCustomMixJobCompletedInput {
  jobId: string;
  sourceBuckets: Record<string, string[]>;
  completedAt: Date;
}

export interface MarkCustomMixJobFailedInput {
  jobId: string;
  errorReason: string;
  completedAt: Date;
}

/**
 * Repository for the `custom_mix_jobs` collection.
 *
 * SEC-16: every write derives `userId` from the caller's argument
 * (which itself originates from the authenticated session). The
 * repository never accepts an externally-supplied `userId`.
 */
@Injectable()
export class CustomMixJobsRepository {
  constructor(
    @InjectModel(CUSTOM_MIX_JOBS_MODEL)
    private readonly model: Model<CustomMixJobsDocument>,
  ) {}

  async insert(input: InsertCustomMixJobInput): Promise<void> {
    await this.model.create({
      jobId: input.jobId,
      userId: input.userId,
      bucketId: input.bucketId,
      promptText: input.promptText,
      state: "building" satisfies CustomMixJobState,
      errorReason: null,
      sourceBuckets: null,
      startedAt: input.startedAt,
      completedAt: null,
    });
  }

  async markCompleted(input: MarkCustomMixJobCompletedInput): Promise<void> {
    await this.model
      .updateOne(
        { jobId: input.jobId },
        {
          $set: {
            state: "completed" satisfies CustomMixJobState,
            sourceBuckets: input.sourceBuckets,
            completedAt: input.completedAt,
          },
        },
      )
      .exec();
  }

  async markFailed(input: MarkCustomMixJobFailedInput): Promise<void> {
    await this.model
      .updateOne(
        { jobId: input.jobId },
        {
          $set: {
            state: "failed" satisfies CustomMixJobState,
            errorReason: input.errorReason,
            completedAt: input.completedAt,
          },
        },
      )
      .exec();
  }

  /**
   * Cross-process safety for the rate-limit guard. Backed by the compound
   * `(userId, state)` index.
   */
  async countInFlight(userId: string): Promise<number> {
    return await this.model.countDocuments({ userId, state: "building" }).exec();
  }

  /**
   * Read the completed job for a bucket to look up its sourceBuckets map.
   * Used by the skip detector (feature 06) to attribute decrements.
   * SEC-16: query is scoped by userId to prevent cross-user attribution.
   */
  async findCompletedByBucket(
    userId: string,
    bucketId: string,
  ): Promise<CustomMixJobsDocument | null> {
    return this.model
      .findOne({ userId, bucketId, state: "completed" satisfies CustomMixJobState })
      .lean()
      .exec() as unknown as CustomMixJobsDocument | null;
  }
}
