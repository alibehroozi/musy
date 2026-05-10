// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under AI-01..AI-03.

import { describe, it } from "vitest";

describe("AI-01: buildTastePrompt never embeds userId / email / IP / session in system or user message", () => {
  it.todo(
    "the rendered (system, userMessage) bytes contain none of the identity strings passed alongside the input",
  );
  it.todo("only snapshot fields (title, artist, kind) from each swipe / listen reach the prompt");
});

describe("AI-02: buildTastePrompt is deterministic — equal inputs produce byte-identical prompts", () => {
  it.todo(
    "two calls with identical (recentSwipes, recentListens, previousSummary) produce equal system + userMessage strings",
  );
  it.todo(
    "two distinct userIds with identical inputs derive equal cache-key inputs (system + userMessage bytes)",
  );
});

describe("AI-03: buildTastePrompt enforces a bounded prompt and truncates newest-first", () => {
  it.todo(
    "at most N=200 swipes reach the user message; older entries are dropped (newest-first retention)",
  );
  it.todo(
    "at most M=100 listens reach the user message; older entries are dropped (newest-first retention)",
  );
  it.todo("previousSummary is truncated to <= 4 KB; the helper does not throw on oversized input");
});
