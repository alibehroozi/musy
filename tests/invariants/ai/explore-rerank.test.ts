// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under AI-04, AI-05.

import { describe, it } from "vitest";

describe("AI-04: buildRerankPrompt never embeds userId / email / IP / session / raw swipe directions", () => {
  it.todo(
    "the rendered (system, userMessage) bytes contain none of the identity strings passed alongside the input",
  );
  it.todo("only (title, artist, source) from each candidate reaches the prompt");
});

describe("AI-05: buildRerankPrompt is deterministic — equal inputs produce byte-identical prompts", () => {
  it.todo(
    "two calls with identical (candidatePool, profileSummary) produce equal system + userMessage strings",
  );
  it.todo("the buildRerankPrompt source contains no fetch / http(s) / network primitive");
});
