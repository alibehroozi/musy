// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under LOGIC-05 and LOGIC-06.

import { describe, it } from "vitest";

describe("LOGIC-05: audio engine is a deterministic state machine exercisable with a mock AudioInterface", () => {
  it.todo("load → playing event → state becomes playing with correct track");
  it.todo("load → playing event → ended event → emits completed, state becomes paused");
  it.todo("load → playing event → error event → state becomes failed with track title");
  it.todo("load → playing event → togglePlay → state becomes paused; togglePlay again → playing");
  it.todo("load(new track) while loading → previous track cancelled, new track is current");
  it.todo("dismiss in failed state → state becomes idle");
  it.todo(
    "same event sequence always produces identical (currentTrack, isPlaying, errorState) triple",
  );
});

describe("LOGIC-06: resolveAndPlay validates ResolveResponse Zod schema", () => {
  it.todo("throws ZodError when /play/resolve response body does not match the schema");
  it.todo("returns a typed ResolveResponse when the response body matches the schema");
});
