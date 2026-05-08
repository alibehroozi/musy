// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under API-03, API-04.

import { describe, it } from "vitest";

describe("API-03: POST /api/search is publicly accessible; returns 400 + ErrorResponse when q is empty or missing", () => {
  it.todo("returns non-401 without a session cookie");
  it.todo("returns 400 + ErrorResponse when q is empty string");
  it.todo("returns 400 + ErrorResponse when q is missing from body");
});

describe("API-04: POST /api/search always returns 200 + SearchResponse, even when all providers fail", () => {
  it.todo("response body matches SearchResponse schema when providers return results");
  it.todo("returns 200 with results: [], partial: true when all providers fail");
  it.todo("response includes cached: false on first request, cached: true on cache hit");
});
