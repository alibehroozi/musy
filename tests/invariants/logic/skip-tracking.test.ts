// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under LOGIC-36, LOGIC-37.

import { describe, it, expect, vi } from "vitest";
import type { SongSnapshot } from "@moc/contracts";
import { isSkip } from "@moc/api-core";
import { PlayEventsService } from "../../../apps/api/src/modules/play/play-events.service.js";

describe("LOGIC-36: isSkip({ playedMs, durationMs }) encodes the < 30 s AND < 50 % rule", () => {
  it("returns true when playedMs < 30_000 and ratio < 0.5", () => {
    expect(isSkip({ playedMs: 5_000, durationMs: 100_000 })).toBe(true);
  });

  it("returns false when playedMs >= 30_000 even if ratio < 0.5", () => {
    expect(isSkip({ playedMs: 30_000, durationMs: 100_000 })).toBe(false);
  });

  it("returns false when playedMs / durationMs >= 0.5 even if playedMs < 30_000", () => {
    // 10_000 / 20_000 === 0.5 → not < 0.5
    expect(isSkip({ playedMs: 10_000, durationMs: 20_000 })).toBe(false);
  });

  it("returns true just below the 30 s boundary", () => {
    expect(isSkip({ playedMs: 29_999, durationMs: 100_000 })).toBe(true);
  });

  it("returns true just below the 50 % boundary (fraction < 0.5)", () => {
    // 10_000 / 20_001 ≈ 0.4999… < 0.5 and 10_000 < 30_000
    expect(isSkip({ playedMs: 10_000, durationMs: 20_001 })).toBe(true);
  });

  it("returns false for a full listen (playedMs === durationMs)", () => {
    expect(isSkip({ playedMs: 240_000, durationMs: 240_000 })).toBe(false);
  });

  it("is deterministic: identical inputs always produce the same result", () => {
    for (let i = 0; i < 5; i++) {
      expect(isSkip({ playedMs: 5_000, durationMs: 100_000 })).toBe(true);
      expect(isSkip({ playedMs: 60_000, durationMs: 100_000 })).toBe(false);
    }
  });
});

// ── Fakes for LOGIC-37 service tests ─────────────────────────────────

function snap(title = "Test Song"): SongSnapshot {
  return { title, artist: "Artist", kind: "track", durationSec: 240 };
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

interface FakeScoreRow {
  userId: string;
  bucketId: string;
  songKey: string;
  delta: number;
}

class FakeBucketScores {
  calls: FakeScoreRow[] = [];
  async inc(input: { userId: string; bucketId: string; songKey: string; delta: number }) {
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
  } | null = null;

  async findCompletedByBucket() {
    return this.jobRow as unknown as
      | import("../../../apps/api/src/modules/taste/custom-mix-jobs.schema.js").CustomMixJobsDocument
      | null;
  }
}

function makeService(opts: { bucketScores: FakeBucketScores; customMixJobs: FakeCustomMixJobs }) {
  return new PlayEventsService(
    new FakeListeningEvents() as never,
    new FakeInterestScores() as never,
    new FakeScoringService() as never,
    opts.bucketScores as never,
    opts.customMixJobs as never,
  );
}

describe("LOGIC-37: skip decrement fires only for custom-mix plays with a completed job row", () => {
  it("bucketKind=custom with matching completed job row → decrement fires for each sourceBucket", async () => {
    const bucketScores = new FakeBucketScores();
    const customMixJobs = new FakeCustomMixJobs();
    const sourceBucketId = "src-bucket-id";
    const songKey = "soundcloud:12345";

    customMixJobs.jobRow = {
      state: "completed",
      sourceBuckets: new Map([[songKey, [sourceBucketId]]]),
    };

    const svc = makeService({ bucketScores, customMixJobs });

    await svc.record({
      userId: "user1",
      source: "soundcloud",
      externalId: "12345",
      snapshot: snap(),
      elapsedMs: 0,
      eventType: "started",
      bucketId: "custom-bucket-id",
      bucketKind: "custom",
    });
    await svc.record({
      userId: "user1",
      source: "soundcloud",
      externalId: "12345",
      snapshot: snap(),
      elapsedMs: 5_000,
      eventType: "completed",
      bucketId: "custom-bucket-id",
      bucketKind: "custom",
    });

    // Wait for the async applySkipDecrement to settle.
    await new Promise((r) => setTimeout(r, 0));

    expect(bucketScores.calls).toHaveLength(1);
    expect(bucketScores.calls[0]).toMatchObject({
      userId: "user1",
      bucketId: sourceBucketId,
      songKey,
      delta: -15,
    });
  });

  it("bucketKind=auto → no decrement even if the song is skipped", async () => {
    const bucketScores = new FakeBucketScores();
    const customMixJobs = new FakeCustomMixJobs();

    const svc = makeService({ bucketScores, customMixJobs });

    await svc.record({
      userId: "user1",
      source: "soundcloud",
      externalId: "12345",
      snapshot: snap(),
      elapsedMs: 0,
      eventType: "started",
      bucketId: "auto-bucket-id",
      bucketKind: "auto",
    });
    await svc.record({
      userId: "user1",
      source: "soundcloud",
      externalId: "12345",
      snapshot: snap(),
      elapsedMs: 5_000,
      eventType: "completed",
      bucketId: "auto-bucket-id",
      bucketKind: "auto",
    });

    await new Promise((r) => setTimeout(r, 0));
    expect(bucketScores.calls).toHaveLength(0);
  });

  it("bucketKind=custom but no custom_mix_jobs row → graceful no-op, no decrement", async () => {
    const bucketScores = new FakeBucketScores();
    const customMixJobs = new FakeCustomMixJobs();
    customMixJobs.jobRow = null;

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const svc = makeService({ bucketScores, customMixJobs });

    await svc.record({
      userId: "user1",
      source: "soundcloud",
      externalId: "12345",
      snapshot: snap(),
      elapsedMs: 0,
      eventType: "started",
      bucketId: "custom-bucket-id",
      bucketKind: "custom",
    });
    await svc.record({
      userId: "user1",
      source: "soundcloud",
      externalId: "12345",
      snapshot: snap(),
      elapsedMs: 5_000,
      eventType: "completed",
      bucketId: "custom-bucket-id",
      bucketKind: "custom",
    });

    await new Promise((r) => setTimeout(r, 0));
    expect(bucketScores.calls).toHaveLength(0);
    warnSpy.mockRestore();
  });

  it("null bucketKind (non-bucket play) → no decrement", async () => {
    const bucketScores = new FakeBucketScores();
    const customMixJobs = new FakeCustomMixJobs();

    const svc = makeService({ bucketScores, customMixJobs });

    await svc.record({
      userId: "user1",
      source: "soundcloud",
      externalId: "12345",
      snapshot: snap(),
      elapsedMs: 0,
      eventType: "started",
      bucketId: null,
      bucketKind: null,
    });
    await svc.record({
      userId: "user1",
      source: "soundcloud",
      externalId: "12345",
      snapshot: snap(),
      elapsedMs: 5_000,
      eventType: "completed",
      bucketId: null,
      bucketKind: null,
    });

    await new Promise((r) => setTimeout(r, 0));
    expect(bucketScores.calls).toHaveLength(0);
  });
});
