// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under LOGIC-05, LOGIC-06.

import { describe, it } from "vitest";

describe("LOGIC-05: extractSourceFromHtml is deterministic; returns null for malformed HTML", () => {
  it.todo("returns the same result when called twice with identical HTML input");
  it.todo("returns null for an empty string");
  it.todo("returns null for HTML that contains no SoundCloud embed JSON");
  it.todo(
    "returns a non-null result with sourceTrackId and clientId for valid SoundCloud embed HTML",
  );
});

describe("LOGIC-06: computeSnapshotHash produces stable output regardless of whitespace or case", () => {
  it.todo("same title/artist/durationSec always produces the same hash");
  it.todo("leading/trailing whitespace in title and artist is normalised before hashing");
  it.todo("upper-case and lower-case variants of the same input produce the same hash");
  it.todo("different inputs produce different hashes");
});
