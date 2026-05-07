// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under API-*.

import { describe, it } from "vitest";

describe("API-01: Every error response from apps/api matches the shared ErrorResponse Zod schema", () => {
  it.todo("404 from an unknown route parses as ErrorResponse");
  it.todo("401 from a protected route parses as ErrorResponse");
  it.todo("400 from a malformed body parses as ErrorResponse");
});

describe("API-02: GET /api/auth/me returns 401 + ErrorResponse without a session, 200 + User with one", () => {
  it.todo("401 + ErrorResponse when no session cookie is present");
  it.todo("401 + ErrorResponse when the session cookie is malformed/forged");
  it.todo("200 + body matching the User Zod schema when the session cookie is valid");
});
