// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under DATA-18.

import { describe, it } from "vitest";

describe("DATA-18: auto-built bucket shape — kind=auto, state=ready, name≤60, description≤200, no dup names", () => {
  it.todo(
    "BucketBuilderService inserts buckets with kind=auto and state=ready when none existed before",
  );
  it.todo("bucket name is at most 60 characters — LLM-proposed longer names are rejected");
  it.todo(
    "bucket description is at most 200 characters — LLM-proposed longer descriptions are rejected",
  );
  it.todo(
    "no duplicate bucket names are inserted for the same userId (case-insensitive after normalize)",
  );
});
