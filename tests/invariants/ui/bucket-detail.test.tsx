// @vitest-environment jsdom
//
// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under UI-37, UI-38.

import { describe, it } from "vitest";

describe("UI-37: bucket-detail Play-all button + row-tap playSnapshot contract", () => {
  it.todo("Play-all button is present when bucket state is ready and songs.length >= 1");
  it.todo("Play-all button is absent when bucket state is ready and songs.length === 0");
  it.todo("Play-all button is absent when bucket state is building");
  it.todo("Play-all button is absent when bucket state is failed");
  it.todo(
    "tapping a ResultRow calls playSnapshot(snapshot, source, externalId, { bucketId, bucketKind })",
  );
  it.todo("ResultRow has no trailing slot (trailing prop absent)");
  it.todo(
    "tapping Play-all starts queue auto-advance: second song plays when engine reaches ended",
  );
});

describe("UI-38: bucket-detail state-based rendering", () => {
  it.todo("building bucket renders Building… heading with no song list and no Play-all");
  it.todo("failed bucket renders errorReason with back link and no song list and no Play-all");
  it.todo('failed bucket with null errorReason renders literal "Mix failed to build"');
  it.todo("404 from API renders Bucket not found message and back link");
  it.todo("network/5xx error renders Couldn't load this bucket and retry button");
  it.todo("ready bucket with 0 songs renders (no songs yet) muted text and no Play-all");
});
