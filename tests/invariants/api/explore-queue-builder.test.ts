// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under API-18, API-19.
//
// These tests exercise QueueBuilderService directly (not through HTTP)
// because the invariants are about service-internal control flow — refill
// trigger semantics and the await-profile-build ordering — that's not
// observable from a single /next round-trip.

import { describe, it, expect, vi } from "vitest";
import type { SongSnapshot, TasteProfile } from "@moc/contracts";
import { computeSnapshotHash } from "@moc/api-core";

import { QueueBuilderService } from "../../../apps/api/src/modules/explore/queue-builder.service.js";

interface FakeSwipeDoc {
  userId: string;
  snapshot: SongSnapshot;
  snapshotHash: string;
  direction: "right" | "left";
  at: Date;
}

class FakeSwipesRepo {
  swipes: FakeSwipeDoc[] = [];
  async findSwipesForUser(userId: string): Promise<FakeSwipeDoc[]> {
    return this.swipes.filter((s) => s.userId === userId);
  }
}

interface FakeQueueDoc {
  id: string;
  userId: string;
  items: SongSnapshot[];
  phase: "discovery" | "artist-refinement" | "personalized";
  generatedAt: Date;
  swipesSeenAtBuild: number;
}

class FakeQueueRepo {
  queues = new Map<string, FakeQueueDoc>();
  async findForUser(userId: string): Promise<FakeQueueDoc | null> {
    return this.queues.get(userId) ?? null;
  }
  async upsertForUser(input: FakeQueueDoc): Promise<void> {
    this.queues.set(input.userId, input);
  }
}

class FakeTasteProfilesRepo {
  profiles = new Map<string, TasteProfile>();
  async findForUser(userId: string): Promise<TasteProfile | null> {
    return this.profiles.get(userId) ?? null;
  }
}

function snapshot(title: string, artist = "Artist"): SongSnapshot {
  return {
    title,
    artist,
    kind: "track",
    coverUrl: "https://cdn/cover.jpg",
  };
}

function profile(overrides: Partial<TasteProfile> = {}): TasteProfile {
  return {
    userId: "u1",
    genres: overrides.genres ?? [{ name: "house", score: 0.9 }],
    artists: overrides.artists ?? [{ name: "Skrillex", score: 0.7 }],
    tempoBucket: overrides.tempoBucket ?? null,
    remixPreference: overrides.remixPreference ?? null,
    summaryText: overrides.summaryText ?? "summary",
    lastBuiltAt: overrides.lastBuiltAt ?? "2026-05-10T00:00:00.000Z",
    swipeCountAtLastBuild: overrides.swipeCountAtLastBuild ?? 20,
  };
}

interface BuildOpts {
  swipes?: FakeSwipesRepo;
  queues?: FakeQueueRepo;
  profilesRepo?: FakeTasteProfilesRepo;
  profileBuilder?: {
    getProfile: (userId: string) => Promise<TasteProfile | null>;
    maybeBuild?: (userId: string) => Promise<void>;
    buildIfDue?: (userId: string) => Promise<void>;
  };
}

function makeBuilder(opts: BuildOpts): {
  builder: QueueBuilderService;
  swipes: FakeSwipesRepo;
  queues: FakeQueueRepo;
} {
  const swipes = opts.swipes ?? new FakeSwipesRepo();
  const queues = opts.queues ?? new FakeQueueRepo();
  const profilesRepo = opts.profilesRepo ?? new FakeTasteProfilesRepo();
  const profileBuilder = opts.profileBuilder ?? {
    getProfile: async (uid: string) => profilesRepo.profiles.get(uid) ?? null,
    maybeBuild: async () => {},
    buildIfDue: async () => {},
  };

  const noopAnthropic = { complete: vi.fn().mockResolvedValue({ text: "{}" }) };
  const noopAudius = { search: vi.fn().mockResolvedValue([]) };
  const noopSoundCloud = { search: vi.fn().mockResolvedValue([]) };
  const noopSearch = {
    search: vi
      .fn()
      .mockResolvedValue({ results: [], partial: false, failedProviders: [], cached: false }),
  };
  const noopPlay = { resolve: vi.fn().mockResolvedValue({}) };
  const fakeConfig = { get: vi.fn().mockReturnValue("claude-sonnet-4-6") };

  const builder = new QueueBuilderService(
    swipes as never,
    profilesRepo as never,
    queues as never,
    profileBuilder as never,
    noopAnthropic as never,
    noopAudius as never,
    noopSoundCloud as never,
    noopSearch as never,
    noopPlay as never,
    fakeConfig as never,
  );

  return { builder, swipes, queues };
}

describe("API-18: maybeRefill triggers on unseen-remaining count, not raw items.length", () => {
  it("fires rebuildQueue when all queue items have been swiped (unseen = 0, raw = 20)", async () => {
    const userId = "u1";
    const items = Array.from({ length: 20 }, (_, i) => snapshot(`song-${i}`));
    const swipes = new FakeSwipesRepo();
    const queues = new FakeQueueRepo();

    // Prime: 20-item queue + 20 matching swipes — every item is "seen".
    queues.queues.set(userId, {
      id: "q1",
      userId,
      items,
      phase: "discovery",
      generatedAt: new Date(),
      swipesSeenAtBuild: 0,
    });
    for (const item of items) {
      swipes.swipes.push({
        userId,
        snapshot: item,
        snapshotHash: computeSnapshotHash(item),
        direction: "left",
        at: new Date(),
      });
    }

    const { builder } = makeBuilder({ swipes, queues });
    const rebuildSpy = vi.spyOn(builder, "rebuildQueue").mockResolvedValue();

    await builder.maybeRefill(userId);
    // The fire-and-forget `void this.rebuildQueue(...)` returns immediately;
    // give the microtask a chance to dispatch before asserting.
    await Promise.resolve();
    await Promise.resolve();

    expect(rebuildSpy).toHaveBeenCalledWith(userId);
  });

  it("does NOT fire rebuildQueue when many unseen items remain (unseen = 15, raw = 20)", async () => {
    const userId = "u1";
    const items = Array.from({ length: 20 }, (_, i) => snapshot(`song-${i}`));
    const swipes = new FakeSwipesRepo();
    const queues = new FakeQueueRepo();

    queues.queues.set(userId, {
      id: "q1",
      userId,
      items,
      phase: "discovery",
      generatedAt: new Date(),
      swipesSeenAtBuild: 0,
    });
    // Only the first 5 are swiped — 15 unseen remain, well above REFILL_THRESHOLD.
    for (const item of items.slice(0, 5)) {
      swipes.swipes.push({
        userId,
        snapshot: item,
        snapshotHash: computeSnapshotHash(item),
        direction: "right",
        at: new Date(),
      });
    }

    const { builder } = makeBuilder({ swipes, queues });
    const rebuildSpy = vi.spyOn(builder, "rebuildQueue").mockResolvedValue();

    await builder.maybeRefill(userId);
    await Promise.resolve();
    await Promise.resolve();

    expect(rebuildSpy).not.toHaveBeenCalled();
  });

  it("fires rebuildQueue when unseen drops below REFILL_THRESHOLD (unseen = 4, raw = 20)", async () => {
    const userId = "u1";
    const items = Array.from({ length: 20 }, (_, i) => snapshot(`song-${i}`));
    const swipes = new FakeSwipesRepo();
    const queues = new FakeQueueRepo();

    queues.queues.set(userId, {
      id: "q1",
      userId,
      items,
      phase: "discovery",
      generatedAt: new Date(),
      swipesSeenAtBuild: 0,
    });
    // Swipe 16 of 20 → 4 unseen, which is < REFILL_THRESHOLD (5).
    for (const item of items.slice(0, 16)) {
      swipes.swipes.push({
        userId,
        snapshot: item,
        snapshotHash: computeSnapshotHash(item),
        direction: "right",
        at: new Date(),
      });
    }

    const { builder } = makeBuilder({ swipes, queues });
    const rebuildSpy = vi.spyOn(builder, "rebuildQueue").mockResolvedValue();

    await builder.maybeRefill(userId);
    await Promise.resolve();
    await Promise.resolve();

    expect(rebuildSpy).toHaveBeenCalledWith(userId);
  });
});

describe("API-19: rebuildQueue awaits profile build when discovery + swipes ≥ 20 + no profile", () => {
  it("calls profileBuilder.buildIfDue before reading profile and computing phase", async () => {
    const userId = "u1";
    const swipes = new FakeSwipesRepo();
    const profilesRepo = new FakeTasteProfilesRepo();
    const queues = new FakeQueueRepo();

    // 20 swipes recorded, profile is null at start. The buildIfDue stub
    // simulates "the build completed" by inserting a profile during its
    // call. We assert that getProfile (used by rebuildQueue to compute
    // phase) was called AFTER buildIfDue, so the rebuild sees the freshly
    // built profile rather than the null pre-build state.
    for (let i = 0; i < 20; i++) {
      const snap = snapshot(`already-swiped-${i}`);
      swipes.swipes.push({
        userId,
        snapshot: snap,
        snapshotHash: computeSnapshotHash(snap),
        direction: "left",
        at: new Date(),
      });
    }

    const calls: string[] = [];
    const buildIfDue = vi.fn(async (uid: string) => {
      calls.push(`buildIfDue:${uid}`);
      // Simulate the side effect: profile becomes available.
      profilesRepo.profiles.set(uid, profile({ userId: uid }));
    });
    const getProfile = vi.fn(async (uid: string) => {
      calls.push(`getProfile:${uid}`);
      return profilesRepo.profiles.get(uid) ?? null;
    });

    const { builder } = makeBuilder({
      swipes,
      queues,
      profilesRepo,
      profileBuilder: { getProfile, buildIfDue, maybeBuild: async () => {} },
    });

    await builder.rebuildQueue(userId);

    expect(buildIfDue).toHaveBeenCalledWith(userId);
    // Ordering: at least one buildIfDue precedes the first getProfile that
    // resolves non-null — this is the property API-19 actually buys us.
    const firstBuild = calls.indexOf(`buildIfDue:${userId}`);
    const firstRead = calls.indexOf(`getProfile:${userId}`);
    expect(firstBuild).toBeGreaterThanOrEqual(0);
    expect(firstRead).toBeGreaterThanOrEqual(0);
    expect(firstBuild).toBeLessThan(firstRead);
  });

  it("does NOT call buildIfDue when a profile already exists (no race to await)", async () => {
    const userId = "u1";
    const swipes = new FakeSwipesRepo();
    const profilesRepo = new FakeTasteProfilesRepo();
    const queues = new FakeQueueRepo();

    // Pre-existing profile → rebuildQueue should skip the build await
    // entirely (the discovery-exit ritual already happened).
    profilesRepo.profiles.set(userId, profile({ userId }));
    for (let i = 0; i < 20; i++) {
      const snap = snapshot(`s${i}`);
      swipes.swipes.push({
        userId,
        snapshot: snap,
        snapshotHash: computeSnapshotHash(snap),
        direction: "right",
        at: new Date(),
      });
    }

    const buildIfDue = vi.fn(async () => {});
    const getProfile = vi.fn(async (uid: string) => profilesRepo.profiles.get(uid) ?? null);

    const { builder } = makeBuilder({
      swipes,
      queues,
      profilesRepo,
      profileBuilder: { getProfile, buildIfDue, maybeBuild: async () => {} },
    });

    await builder.rebuildQueue(userId);

    expect(buildIfDue).not.toHaveBeenCalled();
  });

  it("does NOT call buildIfDue when swipes are below the build threshold (cold-start in progress)", async () => {
    // 5 swipes, no profile yet → still genuinely in discovery, builder
    // shouldn't be asked to build (it would be a no-op anyway, but the
    // contract is: don't await something that isn't due).
    const userId = "u1";
    const swipes = new FakeSwipesRepo();
    const profilesRepo = new FakeTasteProfilesRepo();
    const queues = new FakeQueueRepo();

    for (let i = 0; i < 5; i++) {
      const snap = snapshot(`s${i}`);
      swipes.swipes.push({
        userId,
        snapshot: snap,
        snapshotHash: computeSnapshotHash(snap),
        direction: "right",
        at: new Date(),
      });
    }

    const buildIfDue = vi.fn(async () => {});
    const getProfile = vi.fn(async (uid: string) => profilesRepo.profiles.get(uid) ?? null);

    const { builder } = makeBuilder({
      swipes,
      queues,
      profilesRepo,
      profileBuilder: { getProfile, buildIfDue, maybeBuild: async () => {} },
    });

    await builder.rebuildQueue(userId);

    expect(buildIfDue).not.toHaveBeenCalled();
  });
});
