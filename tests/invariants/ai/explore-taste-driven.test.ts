// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under AI-18, AI-19.

import { describe, it } from "vitest";

describe("AI-18: buildRelatedArtistsPrompt never leaks identity into the prompt body", () => {
  it.todo(
    "(system, userMessage) bytes never contain userId / email / IP / session / numeric scores",
  );
  it.todo(
    "highBucketSamples entries in the prompt body are {title, artist} only — no score values",
  );
  it.todo("is deterministic: equal inputs produce byte-identical (system, userMessage)");
});

describe("AI-19: buildTasteDrivenPickPrompt never leaks identity into the prompt body", () => {
  it.todo(
    "(system, userMessage) bytes never contain userId / email / IP / session / raw swipe history",
  );
  it.todo("score-bucket entries in the prompt body are {title, artist} only");
  it.todo("is deterministic: equal inputs produce byte-identical (system, userMessage)");
});
