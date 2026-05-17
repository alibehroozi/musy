// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under AI-14, AI-15, AI-16.
// PRIVACY-15 is verified here as well (prompt body only sees promptText + pool + buckets).

import { describe, it } from "vitest";

describe("AI-14: buildCustomMixPrompt never embeds userId / email / IP / session", () => {
  it.todo("(stub) rendered (system, userMessage) bytes contain none of the identity strings");
  it.todo("(stub) only the projected per-song fields reach the user message");
  it.todo("(stub) PRIVACY-15: user message is a function of (promptText, pool, buckets) only");
});

describe("AI-15: buildCustomMixPrompt is deterministic — equal inputs produce byte-identical prompts", () => {
  it.todo(
    "(stub) two callers with identical (promptText, pool, buckets) produce equal system + userMessage strings",
  );
});

describe("AI-16: buildCustomMixPrompt enforces a bounded prompt (≤400 songs) and truncates newest-first", () => {
  it.todo("(stub) at most N=400 songs reach the user message; entries past the cap are dropped");
  it.todo("(stub) does not throw on oversized inputs");
  it.todo("(stub) per-bucket description longer than 200 chars is truncated");
});
