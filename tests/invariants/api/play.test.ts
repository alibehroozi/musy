// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under API-08, API-09.

import { describe, it } from "vitest";

describe("API-08: POST /api/play/resolve is publicly accessible; rejects empty/invalid body with 400; never 404 on unmatched", () => {
  it.todo("returns non-401 without a session cookie");
  it.todo("returns 400 + ErrorResponse when body is empty");
  it.todo("returns 400 + ErrorResponse when snapshot is missing");
  it.todo("returns 400 + ErrorResponse when snapshot fails ResolveRequest schema");
  it.todo(
    "returns 200 with source: null when neither provider matches (never 404 for an unmatched track)",
  );
});

describe("API-09: POST /api/play/resolve always returns 200 + ResolveResponse, even when every provider fails", () => {
  it.todo("response body matches ResolveResponse schema for an Audius hit");
  it.todo("response body matches ResolveResponse schema when both providers fail");
});
