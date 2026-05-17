// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under PRIVACY-12.

import { describe, it } from "vitest";

describe("PRIVACY-12: GET /api/me/taste/profile makes no outgoing third-party HTTP request and no LLM call", () => {
  it.todo(
    "the taste module's controller, service, and repositories contain no fetch / http(s) / node:http(s) import",
  );
  it.todo("the taste module's sources contain no Anthropic SDK import");
});
