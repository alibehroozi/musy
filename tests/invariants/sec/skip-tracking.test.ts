// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under SEC-17.

import { describe, it, expect } from "vitest";
import type { SongSnapshot } from "@moc/contracts";
import { PlayEventsService } from "../../../apps/api/src/modules/play/play-events.service.js";

function snap(): SongSnapshot {
  return { title: "Song", artist: "Artist", kind: "track", durationSec: 240 };
}

class FakeListeningEvents {
  async record() {}
}
class FakeInterestScores {
  async upsertEvent() {}
}
class FakeScoringService {
  async recordListenCompleted() {}
}

interface IncCall {
  userId: string;
  bucketId: string;
  songKey: string;
  delta: number;
}

class FakeBucketScores {
  calls: IncCall[] = [];
  async inc(input: IncCall) {
    this.calls.push(input);
  }
  async findBucketIdsForSong() {
    return [];
  }
  async insertInitialScore() {}
  async findForUserBucket() {
    return [];
  }
}

class FakeCustomMixJobs {
  jobRow: {
    sourceBuckets: Map<string, string[]> | null;
    state: string;
  } | null;

  constructor(sourceBuckets: Map<string, string[]> | null) {
    this.jobRow = sourceBuckets !== null ? { state: "completed", sourceBuckets } : null;
  }

  async findCompletedByBucket() {
    return this.jobRow as never;
  }
}

describe("SEC-17: skip decrements only modify bucket_song_scores rows owned by the session user", () => {
  it("skip decrement for user A does not touch user B's bucket_song_scores rows", async () => {
    const bucketScores = new FakeBucketScores();
    const songKey = "soundcloud:12345";
    const customMixJobs = new FakeCustomMixJobs(new Map([[songKey, ["src-bucket"]]]));

    const svc = new PlayEventsService(
      new FakeListeningEvents() as never,
      new FakeInterestScores() as never,
      new FakeScoringService() as never,
      bucketScores as never,
      customMixJobs as never,
    );

    // User A skips a song in their custom-mix bucket.
    await svc.record({
      userId: "userA",
      source: "soundcloud",
      externalId: "12345",
      snapshot: snap(),
      elapsedMs: 0,
      eventType: "started",
      bucketId: "bucketA",
      bucketKind: "custom",
    });
    await svc.record({
      userId: "userA",
      source: "soundcloud",
      externalId: "12345",
      snapshot: snap(),
      elapsedMs: 5_000,
      eventType: "completed",
      bucketId: "bucketA",
      bucketKind: "custom",
    });

    await new Promise((r) => setTimeout(r, 0));

    // Every inc() call must have userId === "userA".
    expect(bucketScores.calls.length).toBeGreaterThan(0);
    for (const call of bucketScores.calls) {
      expect(call.userId).toBe("userA");
    }
  });

  it("userId in every BucketSongScoresRepository.inc() call matches the session user", async () => {
    const bucketScores = new FakeBucketScores();
    const songKey = "soundcloud:99999";
    const customMixJobs = new FakeCustomMixJobs(new Map([[songKey, ["src-b1", "src-b2"]]]));

    const svc = new PlayEventsService(
      new FakeListeningEvents() as never,
      new FakeInterestScores() as never,
      new FakeScoringService() as never,
      bucketScores as never,
      customMixJobs as never,
    );

    const sessionUserId = "session-user-xyz";

    await svc.record({
      userId: sessionUserId,
      source: "soundcloud",
      externalId: "99999",
      snapshot: snap(),
      elapsedMs: 0,
      eventType: "started",
      bucketId: "custom-bucket",
      bucketKind: "custom",
    });
    await svc.record({
      userId: sessionUserId,
      source: "soundcloud",
      externalId: "99999",
      snapshot: snap(),
      elapsedMs: 5_000,
      eventType: "completed",
      bucketId: "custom-bucket",
      bucketKind: "custom",
    });

    await new Promise((r) => setTimeout(r, 0));

    // Two source-buckets → two inc() calls, both stamped with sessionUserId.
    expect(bucketScores.calls).toHaveLength(2);
    for (const call of bucketScores.calls) {
      expect(call.userId).toBe(sessionUserId);
    }
  });
});
