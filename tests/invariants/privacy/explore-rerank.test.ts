// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under PRIVACY-09.

import { describe, it } from "vitest";

describe("PRIVACY-09: explore-rerank prompt is a function only of (candidatePool, profileSummary)", () => {
  it.todo(
    "the rendered (system, userMessage) bytes never contain userId / email / IP / session / raw swipe directions",
  );
  it.todo(
    "two callers with different identity contexts but identical (candidatePool, profileSummary) inputs derive identical prompts",
  );
});
