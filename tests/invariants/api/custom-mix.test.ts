// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under API-26, API-27.
// Stub-only at the spec stage; real assertions land alongside the feat(api) commit.

import { describe, it } from "vitest";

describe("API-26: POST /api/me/taste/custom-mix HTTP contract", () => {
  it.todo("(stub) returns 401 + ErrorResponse without a session cookie");
  it.todo("(stub) returns 400 + ErrorResponse for empty / whitespace promptText");
  it.todo("(stub) returns 400 + ErrorResponse for promptText > 500 chars");
  it.todo("(stub) returns 422 + ErrorResponse when user's positive-signal pool is empty");
  it.todo("(stub) returns 200 + { jobId, bucketId } before Anthropic is called");
  it.todo("(stub) immediately after 200, GET /me/taste/profile lists the bucket in state=building");
});

describe("API-27: POST /api/me/taste/custom-mix concurrent-job rate limit", () => {
  it.todo("(stub) the 6th concurrent build for the same user returns 429");
  it.todo("(stub) finishing a job (completed or failed) frees its slot");
  it.todo("(stub) the cap is per-user — user A's saturation does not affect user B");
});
