// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under API-18, API-19, API-20, API-21.
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
    // Property: at least one buildIfDue precedes the LAST getProfile read,
    // so the final phase decision sees the freshly built profile rather
    // than the null pre-build state. (Implementation may read profile
    // once before buildIfDue to detect the null/threshold condition,
    // then re-read after — that's fine; what matters is the *deciding*
    // read happens after the build.)
    const lastReadIdx = calls.lastIndexOf(`getProfile:${userId}`);
    const firstBuildIdx = calls.indexOf(`buildIfDue:${userId}`);
    expect(firstBuildIdx).toBeGreaterThanOrEqual(0);
    expect(lastReadIdx).toBeGreaterThan(firstBuildIdx);
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

describe("API-21: rebuildQueue is idempotent per user (concurrent calls share one build)", () => {
  it("two parallel rebuildQueue(userId) calls trigger only one underlying Anthropic.complete", async () => {
    const userId = "u-idempotent";

    // Slow Anthropic.complete: resolves after a microtask delay so the
    // second concurrent call has a chance to observe the in-flight Promise.
    let completeCallCount = 0;
    const completePromises: Array<(value: { text: string }) => void> = [];
    const noopAnthropic = {
      complete: vi.fn(
        () =>
          new Promise<{ text: string }>((resolve) => {
            completeCallCount++;
            completePromises.push(resolve);
          }),
      ),
    };
    const noopAudius = { search: vi.fn().mockResolvedValue([]) };
    const noopSoundCloud = { search: vi.fn().mockResolvedValue([]) };
    const noopSearch = {
      search: vi
        .fn()
        .mockResolvedValue({ results: [], partial: false, failedProviders: [], cached: false }),
    };
    const noopPlay = { resolve: vi.fn().mockResolvedValue({}) };
    const fakeConfig = { get: vi.fn().mockReturnValue("claude-sonnet-4-6") };

    const swipes = new FakeSwipesRepo();
    const profilesRepo = new FakeTasteProfilesRepo();
    const queues = new FakeQueueRepo();
    const profileBuilder = {
      getProfile: async (uid: string) => profilesRepo.profiles.get(uid) ?? null,
      maybeBuild: async () => {},
      buildIfDue: async () => {},
    };

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

    // Fire two rebuilds back-to-back; the second must observe the first's
    // in-flight Promise and not start a second LLM call.
    const p1 = builder.rebuildQueue(userId);
    const p2 = builder.rebuildQueue(userId);

    // Both await the same underlying work; resolve the Anthropic complete
    // so both can settle.
    while (completePromises.length === 0) {
      await Promise.resolve();
    }
    for (const resolve of completePromises) resolve({ text: "{}" });

    await Promise.all([p1, p2]);

    expect(completeCallCount).toBe(1);
  });

  it("two SEQUENTIAL rebuildQueue calls each trigger their own underlying build (no caching across windows)", async () => {
    const userId = "u-sequential";

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

    const swipes = new FakeSwipesRepo();
    const profilesRepo = new FakeTasteProfilesRepo();
    const queues = new FakeQueueRepo();
    const profileBuilder = {
      getProfile: async (uid: string) => profilesRepo.profiles.get(uid) ?? null,
      maybeBuild: async () => {},
      buildIfDue: async () => {},
    };

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

    await builder.rebuildQueue(userId);
    await builder.rebuildQueue(userId);

    // After the first settle, inFlightRebuilds is cleared; the second call
    // legitimately runs again. Idempotency is windowed by "currently in
    // flight", not "ever called".
    expect(noopAnthropic.complete).toHaveBeenCalledTimes(2);
  });
});

describe("API-20: getNext surfaces buildingQueue: true while a rebuild is in flight", () => {
  it("returns buildingQueue: true after firing an async rebuild on a missing queue", async () => {
    const userId = "u-building";

    // Slow Anthropic so the rebuild stays in flight long enough for our
    // getNext call to observe the in-flight state.
    const completePromises: Array<(value: { text: string }) => void> = [];
    const noopAnthropic = {
      complete: vi.fn(
        () =>
          new Promise<{ text: string }>((resolve) => {
            completePromises.push(resolve);
          }),
      ),
    };
    const noopAudius = { search: vi.fn().mockResolvedValue([]) };
    const noopSoundCloud = { search: vi.fn().mockResolvedValue([]) };
    const noopSearch = {
      search: vi
        .fn()
        .mockResolvedValue({ results: [], partial: false, failedProviders: [], cached: false }),
    };
    const noopPlay = { resolve: vi.fn().mockResolvedValue({}) };
    const fakeConfig = { get: vi.fn().mockReturnValue("claude-sonnet-4-6") };

    const swipes = new FakeSwipesRepo();
    const profilesRepo = new FakeTasteProfilesRepo();
    const queues = new FakeQueueRepo();
    const profileBuilder = {
      getProfile: async (uid: string) => profilesRepo.profiles.get(uid) ?? null,
      maybeBuild: async () => {},
      buildIfDue: async () => {},
    };

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

    // Kick off a rebuild and DO NOT await it — we want to observe the
    // in-flight state via getNext.
    const rebuildPromise = builder.rebuildQueue(userId);

    // Let the rebuild reach the Anthropic call (its first await point).
    while (completePromises.length === 0) {
      await Promise.resolve();
    }

    const response = await builder.getNext(userId, 20);

    expect(response.buildingQueue).toBe(true);
    expect(response.items).toEqual([]);

    // Resolve the in-flight Anthropic so the test cleanly settles.
    for (const resolve of completePromises) resolve({ text: "{}" });
    await rebuildPromise;
  });

  it("returns buildingQueue: false when no rebuild is in flight and queue is populated", async () => {
    const userId = "u-steady";

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

    const swipes = new FakeSwipesRepo();
    const profilesRepo = new FakeTasteProfilesRepo();
    const queues = new FakeQueueRepo();
    const profileBuilder = {
      getProfile: async (uid: string) => profilesRepo.profiles.get(uid) ?? null,
      maybeBuild: async () => {},
      buildIfDue: async () => {},
    };

    // Prime a non-empty queue, no swipes, no in-flight rebuild.
    queues.queues.set(userId, {
      id: "q-steady",
      userId,
      items: Array.from({ length: 20 }, (_, i) => snapshot(`song-${i}`)),
      phase: "discovery",
      generatedAt: new Date(),
      swipesSeenAtBuild: 0,
    });

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

    const response = await builder.getNext(userId, 20);
    expect(response.buildingQueue).toBe(false);
    expect(response.items.length).toBe(20);
  });
});
