// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under SEC-07.

import { describe, it } from "vitest";

describe("SEC-07: SOUNDCLOUD_USER_AGENT and the SoundCloud client_id never appear in any HTTP response body", () => {
  it.todo(
    "the configured SOUNDCLOUD_USER_AGENT value is not present in a successful POST /api/play/resolve response",
  );
  it.todo(
    "the SoundCloud client_id extracted from upstream HTML is not present in any /api/play/resolve response (audius / soundcloud / null)",
  );
  it.todo(
    "the SOUNDCLOUD_USER_AGENT value is not present in a 400 ErrorResponse from /api/play/resolve",
  );
});
