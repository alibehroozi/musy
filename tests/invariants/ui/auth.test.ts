// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under UI-*.

import { describe, it } from "vitest";

describe("UI-01: app shell gates the main view on /api/auth/me", () => {
  it.todo(
    "renders an element with accessible name 'Sign in with Google' when /api/auth/me returns 401",
  );
  it.todo("renders the main shell (no sign-in button) when /api/auth/me returns 200");
  it.todo("clicking 'Sign in with Google' navigates the browser to /api/auth/google");
});
