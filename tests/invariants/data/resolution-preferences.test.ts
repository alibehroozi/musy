// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under DATA-14.

import { describe, it } from "vitest";

describe("DATA-14: resolution_preferences collection shape (global, persist-forever, score-ordered)", () => {
  it.todo(
    "resolution_preferences schema has a unique compound index on (snapshotHash, source, sourceTrackId)",
  );

  it.todo(
    "resolution_preferences schema has NO TTL index (preferences persist forever — DATA-08's TTL must not have been copied across)",
  );

  it.todo("resolution_preferences schema declares snapshotHash as an indexed string path");

  it.todo(
    "resolution_preferences schema has NO userId field defined anywhere in its paths (preferences are global by design)",
  );

  it.todo(
    "resolution_preferences schema's score field is a number with a min validator of 1 (no zero / negative scores)",
  );

  it.todo("resolution_preferences schema's source field is restricted to 'soundcloud'");
});
