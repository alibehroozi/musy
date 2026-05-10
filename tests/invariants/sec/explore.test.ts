// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under SEC-09.

import { describe, it } from "vitest";

describe("SEC-09: /api/explore/swipe always derives userId from the session, never from the body", () => {
  it.todo(
    "a body field 'userId' targeting victimId is ignored — the swipe + score upsert land under the session's uid",
  );
  it.todo("with no session cookie the call is rejected with 401 before any DB write happens");
  it.todo("user A's swipes / interest_scores writes are scoped to A's userId, not B's");
});
