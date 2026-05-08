// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under API-09, API-10.

import { describe, it } from "vitest";

describe("API-09: POST /play/started and POST /play/completed require a valid session cookie; return 401 + ErrorResponse when missing; return 204 on success", () => {
  it.todo("POST /play/started returns 401 + ErrorResponse with no session cookie");
  it.todo("POST /play/completed returns 401 + ErrorResponse with no session cookie");
  it.todo("POST /play/started returns 401 + ErrorResponse with an invalid session cookie");
  it.todo("POST /play/started returns 204 with no body when authenticated and body is valid");
  it.todo("POST /play/completed returns 204 with no body when authenticated and body is valid");
});

describe("API-10: Both endpoints validate body against Zod schemas; reject malformed bodies with 400 + ErrorResponse; server ignores userId in body", () => {
  it.todo("POST /play/started returns 400 + ErrorResponse when source is missing");
  it.todo("POST /play/started returns 400 + ErrorResponse when externalId is missing");
  it.todo("POST /play/started returns 400 + ErrorResponse when snapshot is malformed");
  it.todo("POST /play/completed returns 400 + ErrorResponse when elapsedMs is negative");
  it.todo("POST /play/completed returns 400 + ErrorResponse when elapsedMs is missing");
  it.todo(
    "a userId field in the request body is ignored — the record uses the session userId, not the body userId",
  );
});
