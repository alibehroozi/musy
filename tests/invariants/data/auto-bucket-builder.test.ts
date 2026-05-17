// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under DATA-18.
// Tests use fake repos to assert what BucketBuilderService writes to the DB.

import { describe, it, expect, vi } from "vitest";
import type { SongSnapshot, TasteBucket } from "@moc/contracts";
import { computeSnapshotHash } from "@moc/api-core";

import { BucketBuilderService } from "../../../apps/api/src/modules/explore/bucket-builder.service.js";

// ── Minimal fakes ─────────────────────────────────────────────────────

interface FakeSwipeDoc {
  userId: string;
  snapshotHash: string;
  snapshot: SongSnapshot;
  direction: "right" | "left";
  at: Date;
}

class FakeSwipes {
  docs: FakeSwipeDoc[] = [];
  async findSwipesForUser(userId: string) {
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
  async findScoresForUser(userId: string) {
    return this.docs.filter((d) => d.userId === userId);
  }
  // Not used by bucket builder but present for type compat.
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
    if (existing) return; // $setOnInsert — no overwrite
    this.rows.push({
      userId: input.userId,
      bucketId: input.bucketId,
      songKey: input.songKey,
      score: input.initialScore,
    });
  }
  async findScoredSongKeysForUser(userId: string): Promise<Set<string>> {
    return new Set(this.rows.filter((r) => r.userId === userId).map((r) => r.songKey));
  }
  async findBucketIdsForSong() {
    return [];
  }
  async inc() {}
}

function snapshot(title: string): SongSnapshot {
  return { title, artist: "Artist", kind: "track", coverUrl: "https://cdn/c.jpg" };
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

// Helper to push positive-signal right-swipes. The legacy MIN_SIGNAL_POOL
// floor inside the bucket-builder is gone (LOGIC-38) — the trigger from
// profile-builder still requires SWIPE_TRIGGER_THRESHOLD total swipes.
function addRightSwipes(swipes: FakeSwipes, userId: string, count: number): SongSnapshot[] {
  const snaps: SongSnapshot[] = [];
  for (let i = 0; i < count; i++) {
    const snap = snapshot(`Song ${i}`);
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

// ── Tests ─────────────────────────────────────────────────────────────

describe("DATA-18: auto-built bucket shape — kind=auto, state=ready, no dup names", () => {
  it("BucketBuilderService inserts buckets with kind=auto and state=ready when none existed before", async () => {
    const swipes = new FakeSwipes();
    const scores = new FakeInterestScores();
    const buckets = new FakeBucketsRepo();
    const bucketScores = new FakeBucketScoresRepo();

    const snaps = addRightSwipes(swipes, "u1", 20);

    const llmOutput = JSON.stringify({
      newBuckets: [{ name: "Chill Electronic", description: "Relaxed electronic music" }],
      assignments: [
        {
          songKey: `snap:${computeSnapshotHash(snaps[0]!)}`,
          bucket: "Chill Electronic",
          initialScore: 80,
        },
      ],
    });

    const svc = makeService({
      swipes,
      scores,
      buckets,
      bucketScores,
      anthropicResponse: llmOutput,
    });
    await svc.maybeBuild("u1");
    // Wait for fire-and-forget to settle.
    await new Promise((r) => setTimeout(r, 0));

    expect(buckets.rows).toHaveLength(1);
    expect(buckets.rows[0]!.kind).toBe("auto");
    expect(buckets.rows[0]!.state).toBe("ready");
    expect(buckets.rows[0]!.userId).toBe("u1");
  });

  it("does not insert duplicate bucket names for the same userId (case-insensitive after normalize)", async () => {
    const swipes = new FakeSwipes();
    const scores = new FakeInterestScores();
    const buckets = new FakeBucketsRepo();
    const bucketScores = new FakeBucketScoresRepo();

    addRightSwipes(swipes, "u1", 20);

    // Pre-seed an existing bucket "chill electronic".
    buckets.rows.push({
      id: "existing-id",
      userId: "u1",
      name: "chill electronic",
      description: null,
      kind: "auto",
      state: "ready",
    });

    // LLM proposes the same name with different case/spacing.
    const llmOutput = JSON.stringify({
      newBuckets: [{ name: "Chill Electronic", description: "Same bucket, different case" }],
      assignments: [],
    });

    const svc = makeService({
      swipes,
      scores,
      buckets,
      bucketScores,
      anthropicResponse: llmOutput,
    });
    await svc.maybeBuild("u1");
    await new Promise((r) => setTimeout(r, 0));

    // Only the pre-seeded row — the LLM-proposed duplicate is skipped.
    const u1Rows = buckets.rows.filter((r) => r.userId === "u1");
    expect(u1Rows).toHaveLength(1);
    expect(u1Rows[0]!.id).toBe("existing-id");
  });

  it("LOGIC-38: build is skipped silently when every positive-signal song is already in bucket_song_scores", async () => {
    const swipes = new FakeSwipes();
    const scores = new FakeInterestScores();
    const buckets = new FakeBucketsRepo();
    const bucketScores = new FakeBucketScoresRepo();
    const fakeAnthropic = { complete: vi.fn() };
    const fakeConfig = { get: vi.fn().mockReturnValue("claude-sonnet-4-6") };

    // Seed a positive-signal pool and a pre-existing score row for every entry —
    // simulating "everything already bucketed by an earlier run".
    const snaps = addRightSwipes(swipes, "u1", 25);
    buckets.rows.push({
      id: "bucket-pre",
      userId: "u1",
      name: "Pre-existing",
      description: null,
      kind: "auto",
      state: "ready",
    });
    for (const snap of snaps) {
      bucketScores.rows.push({
        userId: "u1",
        bucketId: "bucket-pre",
        songKey: `snap:${computeSnapshotHash(snap)}`,
        score: 50,
      });
    }

    const svc = new BucketBuilderService(
      swipes as never,
      scores as never,
      buckets as never,
      bucketScores as never,
      fakeAnthropic as never,
      fakeConfig as never,
    );
    await svc.maybeBuild("u1");
    await new Promise((r) => setTimeout(r, 0));

    expect(fakeAnthropic.complete).not.toHaveBeenCalled();
  });

  it("LOGIC-38: build runs even with a small positive-signal pool (< 20) as long as there is at least one unbucketed song", async () => {
    // Under the incremental policy the legacy MIN_SIGNAL_POOL floor inside the
    // bucket-builder is gone. The trigger from profile-builder already
    // guarantees the global SWIPE_TRIGGER_THRESHOLD — the bucket-builder
    // does NOT add a second floor.
    const swipes = new FakeSwipes();
    const scores = new FakeInterestScores();
    const buckets = new FakeBucketsRepo();
    const bucketScores = new FakeBucketScoresRepo();

    addRightSwipes(swipes, "u1", 5);

    const llmOutput = JSON.stringify({ newBuckets: [], assignments: [] });
    const fakeAnthropic = { complete: vi.fn().mockResolvedValue({ text: llmOutput }) };
    const fakeConfig = { get: vi.fn().mockReturnValue("claude-sonnet-4-6") };

    const svc = new BucketBuilderService(
      swipes as never,
      scores as never,
      buckets as never,
      bucketScores as never,
      fakeAnthropic as never,
      fakeConfig as never,
    );
    await svc.maybeBuild("u1");
    await new Promise((r) => setTimeout(r, 0));

    expect(fakeAnthropic.complete).toHaveBeenCalledTimes(1);
    const userMessage = fakeAnthropic.complete.mock.calls[0]![0].userMessage as string;
    const parsed = JSON.parse(userMessage) as { recentSongs: { songKey: string }[] };
    expect(parsed.recentSongs).toHaveLength(5);
  });

  it("LOGIC-38: the LLM input is capped at 20 newest songs even when the positive-signal pool is larger", async () => {
    const swipes = new FakeSwipes();
    const scores = new FakeInterestScores();
    const buckets = new FakeBucketsRepo();
    const bucketScores = new FakeBucketScoresRepo();

    // 30 right-swipes — 10 over the new cap. The newest 20 should be sent.
    const snaps: SongSnapshot[] = [];
    for (let i = 0; i < 30; i++) {
      const snap = snapshot(`Song ${i}`);
      snaps.push(snap);
      swipes.docs.push({
        userId: "u1",
        snapshotHash: computeSnapshotHash(snap),
        snapshot: snap,
        direction: "right",
        // Newest-first: index 0 is the most recent (now), each next is older.
        at: new Date(Date.now() - i * 1000),
      });
    }

    const llmOutput = JSON.stringify({ newBuckets: [], assignments: [] });
    const fakeAnthropic = { complete: vi.fn().mockResolvedValue({ text: llmOutput }) };
    const fakeConfig = { get: vi.fn().mockReturnValue("claude-sonnet-4-6") };

    const svc = new BucketBuilderService(
      swipes as never,
      scores as never,
      buckets as never,
      bucketScores as never,
      fakeAnthropic as never,
      fakeConfig as never,
    );
    await svc.maybeBuild("u1");
    await new Promise((r) => setTimeout(r, 0));

    expect(fakeAnthropic.complete).toHaveBeenCalledTimes(1);
    const userMessage = fakeAnthropic.complete.mock.calls[0]![0].userMessage as string;
    const parsed = JSON.parse(userMessage) as { recentSongs: { songKey: string }[] };
    expect(parsed.recentSongs).toHaveLength(20);
    // Newest-first: should contain the 20 most-recent songKeys (snaps[0..19]).
    const expectedKeys = snaps.slice(0, 20).map((s) => `snap:${computeSnapshotHash(s)}`);
    expect(parsed.recentSongs.map((s) => s.songKey).sort()).toEqual([...expectedKeys].sort());
  });

  it("LOGIC-38: songKeys already in bucket_song_scores are filtered out of the LLM input", async () => {
    const swipes = new FakeSwipes();
    const scores = new FakeInterestScores();
    const buckets = new FakeBucketsRepo();
    const bucketScores = new FakeBucketScoresRepo();

    // 25 right-swipes. Mark 10 of them as already bucketed.
    const snaps = addRightSwipes(swipes, "u1", 25);
    buckets.rows.push({
      id: "bucket-pre",
      userId: "u1",
      name: "Pre-existing",
      description: null,
      kind: "auto",
      state: "ready",
    });
    const alreadyBucketedKeys = new Set<string>();
    for (let i = 0; i < 10; i++) {
      const k = `snap:${computeSnapshotHash(snaps[i]!)}`;
      alreadyBucketedKeys.add(k);
      bucketScores.rows.push({
        userId: "u1",
        bucketId: "bucket-pre",
        songKey: k,
        score: 50,
      });
    }

    const llmOutput = JSON.stringify({ newBuckets: [], assignments: [] });
    const fakeAnthropic = { complete: vi.fn().mockResolvedValue({ text: llmOutput }) };
    const fakeConfig = { get: vi.fn().mockReturnValue("claude-sonnet-4-6") };

    const svc = new BucketBuilderService(
      swipes as never,
      scores as never,
      buckets as never,
      bucketScores as never,
      fakeAnthropic as never,
      fakeConfig as never,
    );
    await svc.maybeBuild("u1");
    await new Promise((r) => setTimeout(r, 0));

    expect(fakeAnthropic.complete).toHaveBeenCalledTimes(1);
    const userMessage = fakeAnthropic.complete.mock.calls[0]![0].userMessage as string;
    const parsed = JSON.parse(userMessage) as { recentSongs: { songKey: string }[] };
    const sentKeys = new Set(parsed.recentSongs.map((s) => s.songKey));
    // None of the already-bucketed songKeys are present.
    for (const k of alreadyBucketedKeys) {
      expect(sentKeys.has(k)).toBe(false);
    }
    // The remaining 15 unbucketed entries are all included (under the 20 cap).
    expect(parsed.recentSongs).toHaveLength(15);
  });

  it("LOGIC-34: running the builder twice with identical inputs does not overwrite existing bucket_song_scores", async () => {
    const swipes = new FakeSwipes();
    const scores = new FakeInterestScores();
    const buckets = new FakeBucketsRepo();
    const bucketScores = new FakeBucketScoresRepo();

    const snaps = addRightSwipes(swipes, "u1", 20);
    const songKey = `snap:${computeSnapshotHash(snaps[0]!)}`;

    // Pre-seed an existing bucket and score to simulate "first build already ran".
    buckets.rows.push({
      id: "bucket-1",
      userId: "u1",
      name: "Chill",
      description: null,
      kind: "auto",
      state: "ready",
    });
    bucketScores.rows.push({
      userId: "u1",
      bucketId: "bucket-1",
      songKey,
      score: 95, // High score from user interaction
    });

    // Second build proposes the same assignment with a different (lower) initialScore.
    const llmOutput = JSON.stringify({
      newBuckets: [],
      assignments: [{ songKey, bucket: "Chill", initialScore: 30 }],
    });

    const svc = makeService({
      swipes,
      scores,
      buckets,
      bucketScores,
      anthropicResponse: llmOutput,
    });
    await svc.maybeBuild("u1");
    await new Promise((r) => setTimeout(r, 0));

    // Existing score 95 must be unchanged — builder does not overwrite.
    const row = bucketScores.rows.find(
      (r) => r.userId === "u1" && r.bucketId === "bucket-1" && r.songKey === songKey,
    );
    expect(row).toBeDefined();
    expect(row!.score).toBe(95);
  });

  it("assignments for unknown songKeys are dropped with a log warning and do not crash the build", async () => {
    const swipes = new FakeSwipes();
    const scores = new FakeInterestScores();
    const buckets = new FakeBucketsRepo();
    const bucketScores = new FakeBucketScoresRepo();

    addRightSwipes(swipes, "u1", 20);

    const llmOutput = JSON.stringify({
      newBuckets: [{ name: "Punk", description: "Fast punk" }],
      // This songKey is not in any swipe or interest_score for u1.
      assignments: [{ songKey: "snap:nonexistent-hash", bucket: "Punk", initialScore: 50 }],
    });

    const svc = makeService({
      swipes,
      scores,
      buckets,
      bucketScores,
      anthropicResponse: llmOutput,
    });
    await expect(svc.maybeBuild("u1")).resolves.toBeUndefined();
    await new Promise((r) => setTimeout(r, 0));

    // Bucket was inserted, but no score row since the songKey is unknown.
    expect(buckets.rows.filter((r) => r.name === "Punk")).toHaveLength(1);
    expect(bucketScores.rows).toHaveLength(0);
  });

  it(// feat-04 (taste epic) spec authorizes mocking the Anthropic client for the 5xx-failure-mode
  // test specifically, because forcing a 5xx live is unreliable in CI.
  "a simulated Anthropic error leaves existing buckets intact and does not crash the caller", async () => {
    const swipes = new FakeSwipes();
    const scores = new FakeInterestScores();
    const buckets = new FakeBucketsRepo();
    const bucketScores = new FakeBucketScoresRepo();

    addRightSwipes(swipes, "u1", 20);
    buckets.rows.push({
      id: "pre-existing",
      userId: "u1",
      name: "Old Bucket",
      description: null,
      kind: "auto",
      state: "ready",
    });

    const fakeAnthropic = {
      complete: vi.fn().mockRejectedValue(new Error("simulated 5xx")),
    };
    const fakeConfig = { get: vi.fn().mockReturnValue("claude-sonnet-4-6") };

    const svc = new BucketBuilderService(
      swipes as never,
      scores as never,
      buckets as never,
      bucketScores as never,
      fakeAnthropic as never,
      fakeConfig as never,
    );

    // maybeBuild must not propagate the error to the caller.
    await expect(svc.maybeBuild("u1")).resolves.toBeUndefined();
    await new Promise((r) => setTimeout(r, 0));

    // Existing bucket untouched.
    expect(buckets.rows.filter((r) => r.userId === "u1")).toHaveLength(1);
    expect(buckets.rows[0]!.id).toBe("pre-existing");
  });
});
