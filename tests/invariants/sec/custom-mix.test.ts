// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under SEC-16.
// Stub-only at the spec stage; real assertions land alongside the feat(api) commit.

import { describe, it } from "vitest";

describe("SEC-16: POST /api/me/taste/custom-mix scopes userId to the authenticated session", () => {
  it.todo(
    "(stub) buckets row created carries userId === session.user.uid, ignoring any body-supplied userId",
  );
  it.todo("(stub) custom_mix_jobs row created carries the same userId");
  it.todo("(stub) user A's mix never appears in GET /me/taste/profile for user B");
});
