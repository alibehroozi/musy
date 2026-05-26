// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under AI-17.

import { describe, it } from "vitest";

describe("AI-17: buildDiscoveryScenesPrompt never leaks identity into the prompt body", () => {
  it.todo("zero-arg call carries no identity bytes (userId, email, IP, session)");
  it.todo("soft-signal call carries no identity bytes");
  it.todo(
    "two callers with different identity contexts but identical recentSwipes produce identical prompts",
  );
  it.todo("recentSwipes items only contribute {title, artist, direction} to the prompt");
});
