// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under DATA-11.

import { describe, it } from "vitest";

describe("DATA-11: taste_profiles document shape and unique userId index", () => {
  it.todo("schema marks userId, lastBuiltAt, swipeCountAtLastBuild as required");
  it.todo("schema enforces summaryText.maxlength = 500");
  it.todo("schema declares a unique single-field index on userId");
});
