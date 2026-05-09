// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under LOGIC-07, LOGIC-08.

import { describe, it } from "vitest";

describe("LOGIC-07: audio engine is a deterministic state machine testable with a mock driver", () => {
  it.todo("load → playing event → status becomes 'playing' and 'started' emits once");
  it.todo("load → error event → status becomes 'failed' and 'errored' emits once");
  it.todo("load → playing → ended → status becomes 'ended', 'completed' emits with elapsedMs > 0");
  it.todo("load → playing → pause driver event → status becomes 'paused'");
  it.todo("loading a second track while one is loading replaces the first (no orphaned events)");
  it.todo(
    "togglePlay while playing calls driver.pause(); togglePlay while paused calls driver.play()",
  );
});

describe("LOGIC-08: resolveAndPlay validates ResolveResponse Zod schema and throws ZodError on shape mismatch", () => {
  it.todo("resolves successfully when the API returns a valid ResolveResponse shape");
  it.todo("throws ZodError when the API response body is missing required fields");
  it.todo("passes the snapshot through to the fetch body without adding user identifiers");
});
