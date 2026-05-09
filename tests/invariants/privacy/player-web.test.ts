// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under PRIVACY-04.

import { describe, it } from "vitest";

describe("PRIVACY-04: browser audio URL carries no user-identifier query parameters", () => {
  it.todo(
    "the audio engine sets src to the raw streamUrl from the resolver with no extra query params",
  );
  it.todo(
    "the PlayerProvider api.ts resolveStream function does not append user id/session to the stream URL",
  );
  it.todo("the player feature source files do not reference userId or sessionId in stream URLs");
});
