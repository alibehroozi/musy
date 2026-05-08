// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under SEC-04.

import { describe, it } from "vitest";

describe("SEC-04: GENIUS_ACCESS_TOKEN never appears in any HTTP response body", () => {
  it.todo("the token value is not present in a successful POST /api/search response");
  it.todo("the token value is not present in a 400 error response from POST /api/search");
});
