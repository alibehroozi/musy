// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under SEC-06.

import { describe, it } from "vitest";

describe("SEC-06: SOUNDCLOUD_USER_AGENT and extracted client_id never appear in any HTTP response body", () => {
  it.todo("the SOUNDCLOUD_USER_AGENT value does not appear in the /play/resolve response body");
  it.todo(
    "a SoundCloud client_id extracted from the HTML does not appear in the /play/resolve response body",
  );
});
