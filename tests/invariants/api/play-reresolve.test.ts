// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under API-22 and API-23.
// Per AGENTS.md hard rule #15, the SoundCloud client used by these tests is
// the FakeSoundCloudStreamClient from the shared play-test-app helper — the
// only sanctioned exception (we're asserting picker semantics, not upstream
// behavior; the upstream HTTP shape is pinned by the real-provider tests in
// api/play.test.ts and logic/play.test.ts under LOGIC-13).

import { describe, it } from "vitest";

describe("API-22: POST /api/play/reresolve — session-gated, schema-validated, picks next-most-played un-tried candidate, bumps score", () => {
  it.todo("returns 401 + ErrorResponse without a valid session cookie");

  it.todo(
    "returns 400 + ErrorResponse when the body is missing or fails the ReresolveRequest schema",
  );

  it.todo(
    "with a valid session and valid body, returns 200 with a body matching the ResolveResponse schema",
  );

  it.todo(
    "writes a resolution_preferences document with score = 1 when none existed for this snapshotHash",
  );

  it.todo(
    "writes a resolution_preferences document with score = (current max score for snapshotHash) + 1 when at least one already exists",
  );

  it.todo(
    "never persists a (snapshotHash, source, sourceTrackId) combination that already has a preference document for that hash",
  );

  it.todo(
    "among the un-tried SoundCloud candidates returned by the search client, picks the one with the highest playback_count",
  );

  it.todo(
    "returns { source: null, sourceTrackId: null, streamUrl: null, expiresAt: null } when every candidate has already been tried — and writes no new document",
  );
});

describe("API-23: POST /api/play/resolve consults resolution_preferences before the cache + upstream path", () => {
  it.todo(
    "when a preference document exists for the snapshotHash, the response's source/sourceTrackId come from the highest-score preference doc",
  );

  it.todo(
    "when a preference document exists, the upstream SoundCloud/Audius clients are never called for findMatch (no network)",
  );

  it.todo(
    "when multiple preference docs exist for the same snapshotHash, the one with the strictly highest score wins (ties cannot occur by DATA-14 — covered by unique compound index)",
  );

  it.todo(
    "when no preference document exists, the existing cache + upstream resolution path runs unchanged — API-08 / API-09 / API-12 stay green",
  );
});
