// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under PRIVACY-03.

import { describe, it } from "vitest";

describe("PRIVACY-03: Outgoing /play/resolve provider requests carry only snapshot fields and the spoofed UA; no user identifiers", () => {
  it.todo(
    "AudiusStreamClient and SoundCloudStreamClient method signatures accept only snapshot/sourceTrackId — not a userId",
  );
  it.todo(
    "an authenticated POST /api/play/resolve does not forward the session cookie to any provider",
  );
  it.todo(
    "outgoing requests to soundcloud.com / audius.co never include cookie, authorization, or x-forwarded-* headers",
  );
});
