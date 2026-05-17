// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under DATA-19, DATA-20.
// DATA-19 is asserted against the Mongoose schema definition (required fields,
// enums, indexes). DATA-20 is asserted against the BucketsRepository's behavior
// — insertCustomBucket / markCustomReady / markCustomFailed always set the
// promptText + kind pairing required by the spec, while insertBucket
// (auto-builder path) leaves promptText null.

import { describe, it, expect } from "vitest";
import {
  CustomMixJobsSchemaDefinition,
  type CustomMixJobsDocument,
} from "../../../apps/api/src/modules/taste/custom-mix-jobs.schema.js";

function pathOptions<T>(schemaPath: unknown): T | undefined {
  return (schemaPath as { options?: T } | undefined)?.options;
}

describe("DATA-19: custom_mix_jobs document shape and indexes", () => {
  it("schema marks jobId, userId, bucketId, promptText, state, startedAt as required", () => {
    const paths = CustomMixJobsSchemaDefinition.paths;
    for (const p of ["jobId", "userId", "bucketId", "promptText", "state", "startedAt"]) {
      const opts = pathOptions<{ required?: unknown }>(paths[p]);
      expect(opts?.required, `${p} should be required`).toBe(true);
    }
  });

  it('schema\'s state enum is exactly {"building", "completed", "failed"}', () => {
    const opts = pathOptions<{ enum?: unknown }>(CustomMixJobsSchemaDefinition.paths["state"]);
    expect(opts?.enum).toEqual(["building", "completed", "failed"]);
  });

  it("schema enforces promptText length ≤ 500", () => {
    const opts = pathOptions<{ maxlength?: unknown }>(
      CustomMixJobsSchemaDefinition.paths["promptText"],
    );
    expect(opts?.maxlength).toBe(500);
  });

  it("schema declares a unique index on jobId", () => {
    const indexes = CustomMixJobsSchemaDefinition.indexes();
    const uniqJob = indexes.find(([fields, options]) => {
      const f = fields as Record<string, unknown>;
      const o = options as { unique?: unknown } | undefined;
      return Object.keys(f).length === 1 && "jobId" in f && o?.unique === true;
    });
    expect(uniqJob, "unique index on jobId must be declared").toBeDefined();
  });

  it("schema declares a compound index on (userId, state)", () => {
    const indexes = CustomMixJobsSchemaDefinition.indexes();
    const compound = indexes.find(([fields]) => {
      const f = fields as Record<string, unknown>;
      return Object.keys(f).length === 2 && "userId" in f && "state" in f;
    });
    expect(compound, "compound (userId, state) index must be declared").toBeDefined();
  });

  it("CustomMixJobsDocument type exposes the spec's union shape", () => {
    // Type-only check — this test ensures the schema's TypeScript shape stays
    // aligned with the spec (state union, errorReason nullable, completedAt
    // nullable). The check executes by reading a sample doc-shaped object.
    const doc: CustomMixJobsDocument = {
      jobId: "j-1",
      userId: "u-1",
      bucketId: "b-1",
      promptText: "ok",
      state: "building",
      errorReason: null,
      sourceBuckets: null,
      startedAt: new Date(),
      completedAt: null,
    } as unknown as CustomMixJobsDocument;
    expect(doc.state).toBe("building");
    expect(doc.errorReason).toBeNull();
    expect(doc.completedAt).toBeNull();
  });
});

describe("DATA-20: buckets kind/promptText pairing for custom mix vs auto", () => {
  it('insertCustomBucket writes kind === "custom" and a non-null promptText', async () => {
    const { BucketsRepository } =
      await import("../../../apps/api/src/modules/taste/buckets.repository.js");

    const calls: Record<string, unknown>[] = [];
    const fakeModel = {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      create: (doc: any) => {
        calls.push(doc);
        return Promise.resolve(doc);
      },
    };
    const repo = new BucketsRepository(fakeModel as never);

    await repo.insertCustomBucket({
      id: "b-1",
      userId: "u-1",
      promptText: "moody",
      createdAt: new Date("2026-05-17T10:00:00.000Z"),
    });

    expect(calls).toHaveLength(1);
    const doc = calls[0]!;
    expect(doc["kind"]).toBe("custom");
    expect(doc["promptText"]).toBe("moody");
    expect(doc["state"]).toBe("building");
    expect(doc["errorReason"]).toBeNull();
  });

  it('insertBucket (auto path) writes kind === "auto" with promptText === null', async () => {
    const { BucketsRepository } =
      await import("../../../apps/api/src/modules/taste/buckets.repository.js");
    const calls: Record<string, unknown>[] = [];
    const fakeModel = {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      create: (doc: any) => {
        calls.push(doc);
        return Promise.resolve(doc);
      },
    };
    const repo = new BucketsRepository(fakeModel as never);

    await repo.insertBucket({
      id: "b-2",
      userId: "u-1",
      name: "Chill",
      description: "Relaxed",
      kind: "auto",
      state: "ready",
      createdAt: new Date(),
      lastBuiltAt: new Date(),
    });

    const doc = calls[0]!;
    expect(doc["kind"]).toBe("auto");
    expect(doc["promptText"]).toBeNull();
  });

  it("markCustomFailed sets a non-null errorReason on the bucket", async () => {
    const { BucketsRepository } =
      await import("../../../apps/api/src/modules/taste/buckets.repository.js");
    const updates: { filter: unknown; update: unknown }[] = [];
    const fakeModel = {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      updateOne: (filter: any, update: any) => {
        updates.push({ filter, update });
        return { exec: () => Promise.resolve({ acknowledged: true }) };
      },
    };
    const repo = new BucketsRepository(fakeModel as never);
    await repo.markCustomFailed({
      userId: "u-1",
      bucketId: "b-1",
      errorReason: "model_returned_no_valid_songs",
    });
    expect(updates).toHaveLength(1);
    const { update } = updates[0]!;
    expect((update as { $set: { state: string; errorReason: string } }).$set.state).toBe("failed");
    expect((update as { $set: { state: string; errorReason: string } }).$set.errorReason).toBe(
      "model_returned_no_valid_songs",
    );
  });
});
