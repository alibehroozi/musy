// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under PRIVACY-07.

import { describe, it } from "vitest";

describe("PRIVACY-07: /api/explore/swipe makes no outgoing third-party HTTP request", () => {
  it.todo("the explore module's swipes repository source contains no fetch / http(s) call");
  it.todo("the explore service / controller sources contain no fetch / http(s) call");
});
