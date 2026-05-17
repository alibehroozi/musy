// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under DATA-19, DATA-20.
// Stub-only at the spec stage; real assertions land alongside the feat(api) commit.

import { describe, it } from "vitest";

describe("DATA-19: custom_mix_jobs document shape and indexes", () => {
  it.todo(
    "(stub) inserted job has uuid jobId, userId, bucketId, promptText (1..500), state, startedAt",
  );
  it.todo('(stub) state === "failed" requires non-null errorReason');
  it.todo('(stub) state === "completed" requires non-null completedAt and sourceBuckets present');
  it.todo("(stub) collection declares unique index on jobId and compound (userId, state)");
});

describe("DATA-20: buckets kind/promptText pairing for custom mix vs auto", () => {
  it.todo('(stub) kind === "custom" buckets always have non-null promptText');
  it.todo('(stub) kind === "auto" buckets always have promptText === null');
  it.todo('(stub) state === "failed" custom-mix bucket carries non-null errorReason');
});
