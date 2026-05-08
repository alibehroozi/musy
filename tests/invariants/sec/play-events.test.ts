// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under SEC-07.

import { describe, it } from "vitest";

describe("SEC-07: User A's session cannot write to user B's interest_scores or listening_events by body field manipulation", () => {
  it.todo("a userId field in the POST /play/started body is ignored; record uses session userId");
  it.todo("a userId field in the POST /play/completed body is ignored; record uses session userId");
  it.todo(
    "user A cannot overwrite user B's interest_scores by supplying user B's songKey + user A's session",
  );
});
