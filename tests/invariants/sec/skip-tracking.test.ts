// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under SEC-16.

import { describe, it } from "vitest";

describe("SEC-16: skip decrements only modify bucket_song_scores rows owned by the session user", () => {
  it.todo("skip decrement for user A does not touch user B's bucket_song_scores rows");
  it.todo("userId in every BucketSongScoresRepository.inc() call matches the session user");
});
