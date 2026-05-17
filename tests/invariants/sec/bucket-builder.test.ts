// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under SEC-14.

import { describe, it } from "vitest";

describe("SEC-14: auto-bucket builder reads/writes only the caller userId's data", () => {
  it.todo("BucketBuilderService.maybeBuild(userA) never reads swipes belonging to userB");
  it.todo("BucketBuilderService.maybeBuild(userA) never reads interest_scores belonging to userB");
  it.todo("every buckets row written by BucketBuilderService has userId === the caller's userId");
  it.todo(
    "every bucket_song_scores row written by BucketBuilderService has userId === the caller's userId",
  );
});
