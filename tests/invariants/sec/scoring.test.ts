// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under SEC-13.

import { describe, it } from "vitest";

describe("SEC-13: scoring writes are scoped to the authenticated session's userId", () => {
  it.todo("a right-swipe by user A writes context_scores rows tagged with A's userId only");
  it.todo("a swipe body that smuggles userId=B for an A-session never reaches the scoring service");
  it.todo("a save event by user A never writes a context_scores row tagged with B's userId");
  it.todo(
    "a listen-completed event by user A never writes a context_scores row tagged with B's userId",
  );
});
