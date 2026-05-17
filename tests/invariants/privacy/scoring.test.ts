// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under PRIVACY-13.

import { describe, it } from "vitest";

describe("PRIVACY-13: context-score writes never reach third parties or LLM prompts", () => {
  it.todo("the scoring service source contains no fetch / http(s) / node:http(s) import");
  it.todo("the scoring service source contains no Anthropic SDK import");
  it.todo("the context_scores repository source contains no fetch / http(s) / node:http(s) import");
  it.todo("the libs/api/core/taste helpers contain no fetch / http(s) / node:http(s) import");
});
