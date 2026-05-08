// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under SEC-06.

import { describe, it } from "vitest";

describe("SEC-06: interest_scores documents are scoped per-user; no endpoint exposes another user's documents", () => {
  it.todo("user A's explored/saved events are stored under user A's userId");
  it.todo("user B cannot read user A's interest_scores documents via any endpoint in this feature");
});
