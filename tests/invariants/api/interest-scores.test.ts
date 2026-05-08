// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under API-07.

import { describe, it } from "vitest";

describe("API-07: POST /api/search/explored and POST /api/search/saved require a valid session; return 401 without session", () => {
  it.todo(
    "POST /api/search/explored returns 401 + ErrorResponse when no session cookie is present",
  );
  it.todo("POST /api/search/saved returns 401 + ErrorResponse when no session cookie is present");
  it.todo("POST /api/search/explored returns 204 when a valid session cookie is present");
  it.todo("POST /api/search/saved returns 204 when a valid session cookie is present");
});
