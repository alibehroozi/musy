// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under SEC-15.

import { describe, it, expect, vi } from "vitest";
import type { SongSnapshot, TasteBucket } from "@moc/contracts";
import { computeSnapshotHash } from "@moc/api-core";

import { BucketBuilderService } from "../../../apps/api/src/modules/explore/bucket-builder.service.js";

// ── Minimal fakes (same pattern as data/auto-bucket-builder.test.ts) ──

interface FakeSwipeDoc {
  userId: string;
  snapshotHash: string;
  snapshot: SongSnapshot;
  direction: "right" | "left";
  at: Date;
}

class FakeSwipes {
  docs: FakeSwipeDoc[] = [];
  readCalls: string[] = [];
  async findSwipesForUser(userId: string) {
    this.readCalls.push(userId);
    return this.docs.filter((d) => d.userId === userId);
  }
}

interface FakeScoreDoc {
  userId: string;
  songKey: string;
  snapshot: SongSnapshot;
  lastEventType: "explored" | "saved" | "completed";
  lastEventAt: Date;
}

class FakeInterestScores {
  docs: FakeScoreDoc[] = [];
  readCalls: string[] = [];
  async findScoresForUser(userId: string) {
    this.readCalls.push(userId);
    return this.docs.filter((d) => d.userId === userId);
  }
  async sampleByScoreBucket() {
    return [];
  }
}

interface FakeBucketRow {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  kind: string;
  state: string;
}

class FakeBucketsRepo {
  rows: FakeBucketRow[] = [];
  async findForUser(userId: string): Promise<TasteBucket[]> {
    return this.rows
      .filter((r) => r.userId === userId)
      .map((r) => ({
        id: r.id,
        userId: r.userId,
        name: r.name,
        description: r.description,
        kind: r.kind as "auto" | "custom",
        state: r.state as "ready" | "building" | "failed",
        promptText: null,
        errorReason: null,
        createdAt: new Date().toISOString(),
        lastBuiltAt: new Date().toISOString(),
        coverArtworkUrl: null,
      }));
  }
  async insertBucket(input: FakeBucketRow): Promise<void> {
    this.rows.push(input);
  }
}

interface FakeScoreRow {
  userId: string;
  bucketId: string;
  songKey: string;
  score: number;
}

class FakeBucketScoresRepo {
  rows: FakeScoreRow[] = [];
  async insertInitialScore(input: {
    userId: string;
    bucketId: string;
    songKey: string;
    snapshot: SongSnapshot;
    initialScore: number;
    at: Date;
  }): Promise<void> {
    const existing = this.rows.find(
      (r) =>
        r.userId === input.userId && r.bucketId === input.bucketId && r.songKey === input.songKey,
    );
    if (existing) return;
    this.rows.push({
      userId: input.userId,
      bucketId: input.bucketId,
      songKey: input.songKey,
      score: input.initialScore,
    });
  }
  async findBucketIdsForSong() {
    return [];
  }
  async inc() {}
}

function snapshot(title: string): SongSnapshot {
  return { title, artist: "Artist", kind: "track", coverUrl: "https://cdn/c.jpg" };
}

function addRightSwipes(swipes: FakeSwipes, userId: string, count: number): SongSnapshot[] {
  const snaps: SongSnapshot[] = [];
  for (let i = 0; i < count; i++) {
    const snap = snapshot(`Song ${i} for ${userId}`);
    snaps.push(snap);
    swipes.docs.push({
      userId,
      snapshotHash: computeSnapshotHash(snap),
      snapshot: snap,
      direction: "right",
      at: new Date(),
    });
  }
  return snaps;
}

function makeService(opts: {
  swipes: FakeSwipes;
  scores: FakeInterestScores;
  buckets: FakeBucketsRepo;
  bucketScores: FakeBucketScoresRepo;
  anthropicResponse: string;
}) {
  const fakeAnthropic = { complete: vi.fn().mockResolvedValue({ text: opts.anthropicResponse }) };
  const fakeConfig = { get: vi.fn().mockReturnValue("claude-sonnet-4-6") };

  return new BucketBuilderService(
    opts.swipes as never,
    opts.scores as never,
    opts.buckets as never,
    opts.bucketScores as never,
    fakeAnthropic as never,
    fakeConfig as never,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────

describe("SEC-15: auto-bucket builder reads/writes only the caller userId's data", () => {
  it("BucketBuilderService.maybeBuild(userA) never reads swipes belonging to userB", async () => {
    const swipes = new FakeSwipes();
    const scores = new FakeInterestScores();
    const buckets = new FakeBucketsRepo();
    const bucketScores = new FakeBucketScoresRepo();

    // Seed swipes for both users.
    addRightSwipes(swipes, "userA", 20);
    addRightSwipes(swipes, "userB", 20);

    const llmOutput = JSON.stringify({ newBuckets: [], assignments: [] });
    const svc = makeService({
      swipes,
      scores,
      buckets,
      bucketScores,
      anthropicResponse: llmOutput,
    });

    await svc.maybeBuild("userA");
    await new Promise((r) => setTimeout(r, 0));

    // findSwipesForUser should only have been called with "userA".
    expect(swipes.readCalls).toContain("userA");
    expect(swipes.readCalls).not.toContain("userB");
  });

  it("BucketBuilderService.maybeBuild(userA) never reads interest_scores belonging to userB", async () => {
    const swipes = new FakeSwipes();
    const scores = new FakeInterestScores();
    const buckets = new FakeBucketsRepo();
    const bucketScores = new FakeBucketScoresRepo();

    addRightSwipes(swipes, "userA", 20);

    // Seed interest_scores for both users.
    const snapA = snapshot("UserA Score Song");
    scores.docs.push({
      userId: "userA",
      songKey: `snap:${computeSnapshotHash(snapA)}`,
      snapshot: snapA,
      lastEventType: "saved",
      lastEventAt: new Date(),
    });
    const snapB = snapshot("UserB Score Song");
    scores.docs.push({
      userId: "userB",
      songKey: `snap:${computeSnapshotHash(snapB)}`,
      snapshot: snapB,
      lastEventType: "saved",
      lastEventAt: new Date(),
    });

    const llmOutput = JSON.stringify({ newBuckets: [], assignments: [] });
    const svc = makeService({
      swipes,
      scores,
      buckets,
      bucketScores,
      anthropicResponse: llmOutput,
    });

    await svc.maybeBuild("userA");
    await new Promise((r) => setTimeout(r, 0));

    expect(scores.readCalls).toContain("userA");
    expect(scores.readCalls).not.toContain("userB");
  });

  it("every buckets row written by BucketBuilderService has userId === the caller's userId", async () => {
    const swipes = new FakeSwipes();
    const scores = new FakeInterestScores();
    const buckets = new FakeBucketsRepo();
    const bucketScores = new FakeBucketScoresRepo();

    addRightSwipes(swipes, "userA", 20);
    addRightSwipes(swipes, "userB", 20);

    // LLM proposes a new bucket — triggered only for userA.
    const llmOutput = JSON.stringify({
      newBuckets: [{ name: "Indie Rock", description: "Guitar-driven indie" }],
      assignments: [],
    });
    const svc = makeService({
      swipes,
      scores,
      buckets,
      bucketScores,
      anthropicResponse: llmOutput,
    });

    await svc.maybeBuild("userA");
    await new Promise((r) => setTimeout(r, 0));

    // Every inserted row must be scoped to "userA".
    expect(buckets.rows.length).toBeGreaterThan(0);
    for (const row of buckets.rows) {
      expect(row.userId).toBe("userA");
    }
  });

  it("every bucket_song_scores row written by BucketBuilderService has userId === the caller's userId", async () => {
    const swipes = new FakeSwipes();
    const scores = new FakeInterestScores();
    const buckets = new FakeBucketsRepo();
    const bucketScores = new FakeBucketScoresRepo();

    const snapsA = addRightSwipes(swipes, "userA", 20);
    addRightSwipes(swipes, "userB", 20);

    const songKey = `snap:${computeSnapshotHash(snapsA[0]!)}`;
    const llmOutput = JSON.stringify({
      newBuckets: [{ name: "Pop", description: "Chart pop" }],
      assignments: [{ songKey, bucket: "Pop", initialScore: 70 }],
    });
    const svc = makeService({
      swipes,
      scores,
      buckets,
      bucketScores,
      anthropicResponse: llmOutput,
    });

    await svc.maybeBuild("userA");
    await new Promise((r) => setTimeout(r, 0));

    // Every score row must be scoped to "userA".
    expect(bucketScores.rows.length).toBeGreaterThan(0);
    for (const row of bucketScores.rows) {
      expect(row.userId).toBe("userA");
    }
  });
});
