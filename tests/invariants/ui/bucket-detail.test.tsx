// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under UI-37, UI-38.

import { describe, it } from "vitest";

describe("UI-37: /taste/buckets/:bucketId page shell — ready / building / failed", () => {
  it.todo(
    'ready state: h1 with bucket name, "N songs" subtitle (singular at N=1), cover, Play all visible when songs.length >= 1',
  );

  it.todo("ready state: Play all is NOT rendered when songs.length === 0");

  it.todo("ready state: each song row uses the ResultRow component with NO trailing slot rendered");

  it.todo(
    "ready state: song list order is the array order returned by the server (no client re-sort)",
  );

  it.todo('building state: subtitle is the literal text "Building…", no song list, no Play all');

  it.todo(
    'failed state: errorReason text rendered (or "Mix failed to build" when null), no song list, no Play all',
  );

  it.todo(
    "all three states render a single accessible back affordance that navigates to /taste via React Router",
  );

  it.todo(
    "no raw <button>/<input>/<textarea>/<select> in the page — DS components only (AGENTS.md hard rule #14)",
  );
});

describe("UI-38: row tap + Play all wire into PlayerProvider with bucket context", () => {
  it.todo(
    "tapping a song row calls playSnapshot(snapshot, source, externalId, { bucketId, bucketKind })",
  );

  it.todo("source + externalId are derived from the row's songKey via splitSongKey");

  it.todo("tapping Play all enqueues every row in render order and starts playback at index 0");

  it.todo(
    "Play all auto-advance: the engine's 'completed' event loads the next snapshot until the queue drains",
  );

  it.todo(
    "every playSnapshot invocation from this page receives the SAME { bucketId, bucketKind } for the loaded bucket",
  );
});
