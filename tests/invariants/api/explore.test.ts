// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under API-14.

import { describe, it } from "vitest";

describe("API-14: POST /api/explore/swipe contract — auth, body validation, ledger + score side effects", () => {
  it.todo("returns 401 + ErrorResponse without a session cookie");
  it.todo("returns 400 + ErrorResponse when the body is empty");
  it.todo("returns 400 + ErrorResponse when direction is not 'right' or 'left'");
  it.todo("returns 400 + ErrorResponse when snapshot is missing required fields");
  it.todo(
    "returns 204 with no body for a valid right-swipe; writes one swipes doc and upserts interest_scores >= 8",
  );
  it.todo(
    "returns 204 for a valid left-swipe; writes one swipes doc but does not create or modify interest_scores",
  );
  it.todo(
    "two consecutive right-swipes on the same snapshot create two ledger entries and leave interest_scores.score at 8 (monotonic)",
  );
});
