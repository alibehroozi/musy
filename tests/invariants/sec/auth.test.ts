// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under SEC-*.

import { describe, it } from "vitest";

describe("SEC-01: Session/state cookie values and signing/client secrets never appear in any response body or log line", () => {
  it.todo("the session cookie value is not echoed in any response body");
  it.todo("the oauth_state cookie value is not echoed in any response body");
  it.todo("SESSION_SECRET is never echoed in any response body");
  it.todo("GOOGLE_CLIENT_SECRET is never echoed in any response body");
});

describe("SEC-02: GET /api/auth/google/callback returns 4xx when state is missing or mismatched (CSRF)", () => {
  it.todo("400 when state query param is missing");
  it.todo("400 when oauth_state cookie is missing");
  it.todo("400 when state query and oauth_state cookie do not match");
});

describe("SEC-03: Routes outside the public allowlist return 401 without a valid session cookie", () => {
  it.todo("GET /api/auth/me returns 401 without session");
  it.todo("GET /health is public and returns 200 without session");
  it.todo("GET /api/auth/google is public and redirects without session");
  it.todo("GET /api/auth/google/callback is public (its own CSRF check protects it)");
  it.todo("POST /api/auth/logout is public and returns 204 without session");
});
