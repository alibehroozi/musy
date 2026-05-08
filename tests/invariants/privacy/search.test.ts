// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under PRIVACY-01.

import { describe, it } from "vitest";

describe("PRIVACY-01: Outgoing provider requests carry only the query string; no user identifiers are forwarded", () => {
  it.todo(
    "provider client search methods accept only a query string parameter, not a user identifier",
  );
  it.todo("an authenticated POST /api/search does not forward the session cookie to any provider");
});
