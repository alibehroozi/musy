// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under PRIVACY-03.

import { describe, it } from "vitest";

describe("PRIVACY-03: audio-fetch URL originates verbatim from resolver; no user-id query params added", () => {
  it.todo(
    "the streamUrl returned by resolveAndPlay is set verbatim on the audio element with no extra query params",
  );
});
