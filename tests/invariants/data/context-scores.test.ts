// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under DATA-17.

import { describe, it } from "vitest";

describe("DATA-17: context_scores document shape and unique (userId, songKey, axis, value) index", () => {
  it.todo(
    "schema marks userId, songKey, axis, value, score, lastEventType, lastEventAt as required",
  );
  it.todo("schema's axis enum is exactly {'weekday', 'timeOfDay', 'month'}");
  it.todo("schema's lastEventType enum is exactly the four event types");
  it.todo("schema constrains score to an integer in [0, 100]");
  it.todo("schema declares a unique compound index on (userId, songKey, axis, value)");
  it.todo("schema declares a compound index on (userId, songKey)");
});
