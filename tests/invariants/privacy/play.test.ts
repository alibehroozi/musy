// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under PRIVACY-03.

import { describe, it } from "vitest";

describe("PRIVACY-03: Outgoing requests to Audius and SoundCloud carry only song-snapshot data; no user identifier or session cookie", () => {
  it.todo("Audius search requests contain only the title+artist query; no session/user headers");
  it.todo(
    "SoundCloud page-fetch requests contain only the spoofed User-Agent; no session/user headers",
  );
});
