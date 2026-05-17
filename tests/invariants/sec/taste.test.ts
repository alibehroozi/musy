// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under SEC-12.

import { describe, it } from "vitest";

describe("SEC-12: GET /api/me/taste/profile scopes every read to the authenticated session's userId", () => {
  it.todo("user A's buckets are never returned to user B");
  it.todo("the buckets repository read filter always includes the authenticated userId");
});
