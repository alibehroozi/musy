// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under API-18, API-19, API-20, API-21, API-25.
//
// These tests exercise QueueBuilderService directly (not through HTTP)
// because the invariants are about service-internal control flow — refill
// trigger semantics, the await-profile-build ordering, and slot-eligibility
// filtering — that's not observable from a single /next round-trip.

import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
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
  const noopInterestScores = { sampleByScoreBucket: vi.fn().mockResolvedValue([]) };
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
    noopInterestScores as never,
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

    const noopInterestScores = { sampleByScoreBucket: vi.fn().mockResolvedValue([]) };
    const builder = new QueueBuilderService(
      swipes as never,
      profilesRepo as never,
      queues as never,
      profileBuilder as never,
      noopAnthropic as never,
      noopAudius as never,
      noopSoundCloud as never,
      noopSearch as never,
      noopInterestScores as never,
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

    const noopInterestScores = { sampleByScoreBucket: vi.fn().mockResolvedValue([]) };
    const builder = new QueueBuilderService(
      swipes as never,
      profilesRepo as never,
      queues as never,
      profileBuilder as never,
      noopAnthropic as never,
      noopAudius as never,
      noopSoundCloud as never,
      noopSearch as never,
      noopInterestScores as never,
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

    const noopInterestScores = { sampleByScoreBucket: vi.fn().mockResolvedValue([]) };
    const builder = new QueueBuilderService(
      swipes as never,
      profilesRepo as never,
      queues as never,
      profileBuilder as never,
      noopAnthropic as never,
      noopAudius as never,
      noopSoundCloud as never,
      noopSearch as never,
      noopInterestScores as never,
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

    const noopInterestScores = { sampleByScoreBucket: vi.fn().mockResolvedValue([]) };
    const builder = new QueueBuilderService(
      swipes as never,
      profilesRepo as never,
      queues as never,
      profileBuilder as never,
      noopAnthropic as never,
      noopAudius as never,
      noopSoundCloud as never,
      noopSearch as never,
      noopInterestScores as never,
      noopPlay as never,
      fakeConfig as never,
    );

    const response = await builder.getNext(userId, 20);
    expect(response.buildingQueue).toBe(false);
    expect(response.items.length).toBe(20);
  });
});

describe("API-25: GET /api/explore/next contextual slot eligibility (per LOGIC-33)", () => {
  // Anchor "now" inside getNext. The service derives the current slot via
  // server-side new Date() so we control time globally for these tests.
  // 2026-05-19 19:30 = Tuesday / evening.
  const TUE_EVENING = new Date(2026, 4, 19, 19, 30);
  // 2026-05-20 09:00 = Wednesday / morning.
  const WED_MORNING = new Date(2026, 4, 20, 9, 0);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(TUE_EVENING);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("includes a song whose only swipe was in a different slot — the eligibility filter is contextual, not 'any swipe forever'", async () => {
    const userId = "u-context-1";
    const swipes = new FakeSwipesRepo();
    const queues = new FakeQueueRepo();

    const swipedSnap = snapshot("swiped-on-wed-morning");
    queues.queues.set(userId, {
      id: "q1",
      userId,
      items: [swipedSnap, snapshot("never-swiped")],
      phase: "discovery",
      generatedAt: TUE_EVENING,
      swipesSeenAtBuild: 0,
    });

    // Swipe happened in Wednesday-morning slot — different from "now" (Tue eve).
    swipes.swipes.push({
      userId,
      snapshot: swipedSnap,
      snapshotHash: computeSnapshotHash(swipedSnap),
      direction: "right",
      at: WED_MORNING,
    });

    const { builder } = makeBuilder({ swipes, queues });

    const response = await builder.getNext(userId, 20);
    const titles = response.items.map((i) => i.title);
    expect(titles).toContain("swiped-on-wed-morning");
    expect(titles).toContain("never-swiped");
  });

  it("excludes a song whose swipe lands in the current slot — slot-burnt at (tue, evening)", async () => {
    const userId = "u-context-2";
    const swipes = new FakeSwipesRepo();
    const queues = new FakeQueueRepo();

    const swipedSnap = snapshot("swiped-now-tue-evening");
    queues.queues.set(userId, {
      id: "q1",
      userId,
      items: [swipedSnap, snapshot("never-swiped")],
      phase: "discovery",
      generatedAt: TUE_EVENING,
      swipesSeenAtBuild: 0,
    });
    swipes.swipes.push({
      userId,
      snapshot: swipedSnap,
      snapshotHash: computeSnapshotHash(swipedSnap),
      direction: "right",
      at: TUE_EVENING,
    });

    const { builder } = makeBuilder({ swipes, queues });

    const response = await builder.getNext(userId, 20);
    const titles = response.items.map((i) => i.title);
    expect(titles).not.toContain("swiped-now-tue-evening");
    expect(titles).toContain("never-swiped");
  });

  it("left-swipe in the current slot excludes the song (left burns forever — covers the current slot too)", async () => {
    const userId = "u-context-3";
    const swipes = new FakeSwipesRepo();
    const queues = new FakeQueueRepo();

    const swipedSnap = snapshot("left-at-tue-evening");
    queues.queues.set(userId, {
      id: "q1",
      userId,
      items: [swipedSnap],
      phase: "discovery",
      generatedAt: TUE_EVENING,
      swipesSeenAtBuild: 0,
    });
    swipes.swipes.push({
      userId,
      snapshot: swipedSnap,
      snapshotHash: computeSnapshotHash(swipedSnap),
      direction: "left",
      at: TUE_EVENING,
    });

    const { builder } = makeBuilder({ swipes, queues });

    const response = await builder.getNext(userId, 20);
    expect(response.items.map((i) => i.title)).not.toContain("left-at-tue-evening");
  });

  it("after 28 distinct (weekday, timeOfDay) swipes of the same song, it is permanently excluded at every slot", async () => {
    const userId = "u-context-4";
    const swipes = new FakeSwipesRepo();
    const queues = new FakeQueueRepo();

    const burntSnap = snapshot("28-slot-burnt");
    queues.queues.set(userId, {
      id: "q1",
      userId,
      items: [burntSnap, snapshot("fresh")],
      phase: "discovery",
      generatedAt: TUE_EVENING,
      swipesSeenAtBuild: 0,
    });

    // Push 28 swipes covering all (weekday, timeOfDay) slots.
    // 2026-05-17 = Sunday anchor.
    const sunday = new Date(2026, 4, 17, 0, 0);
    const hours = [2, 9, 14, 20]; // night / morning / afternoon / evening
    for (let d = 0; d < 7; d++) {
      for (const h of hours) {
        const at = new Date(sunday);
        at.setDate(sunday.getDate() + d);
        at.setHours(h, 0, 0, 0);
        swipes.swipes.push({
          userId,
          snapshot: burntSnap,
          snapshotHash: computeSnapshotHash(burntSnap),
          direction: "right",
          at,
        });
      }
    }
    expect(swipes.swipes).toHaveLength(28);

    const { builder } = makeBuilder({ swipes, queues });

    // At every slot the burnt song must be excluded. Sample a few.
    for (const t of [
      TUE_EVENING,
      WED_MORNING,
      new Date(2026, 4, 17, 3, 0), // Sun night
      new Date(2026, 4, 23, 14, 0), // Sat afternoon
    ]) {
      vi.setSystemTime(t);
      const r = await builder.getNext(userId, 20);
      const titles = r.items.map((i) => i.title);
      expect(titles, `expected '28-slot-burnt' excluded at ${t.toISOString()}`).not.toContain(
        "28-slot-burnt",
      );
      expect(titles).toContain("fresh");
    }
  });

  it("user A's swipe at the current slot does not affect user B's eligibility", async () => {
    const swipes = new FakeSwipesRepo();
    const queues = new FakeQueueRepo();

    const sharedSnap = snapshot("shared-song");
    queues.queues.set("A", {
      id: "qA",
      userId: "A",
      items: [sharedSnap],
      phase: "discovery",
      generatedAt: TUE_EVENING,
      swipesSeenAtBuild: 0,
    });
    queues.queues.set("B", {
      id: "qB",
      userId: "B",
      items: [sharedSnap],
      phase: "discovery",
      generatedAt: TUE_EVENING,
      swipesSeenAtBuild: 0,
    });
    // Only user A swiped at (tue, evening).
    swipes.swipes.push({
      userId: "A",
      snapshot: sharedSnap,
      snapshotHash: computeSnapshotHash(sharedSnap),
      direction: "right",
      at: TUE_EVENING,
    });

    const { builder } = makeBuilder({ swipes, queues });

    const ra = await builder.getNext("A", 20);
    expect(ra.items.map((i) => i.title)).not.toContain("shared-song");
    const rb = await builder.getNext("B", 20);
    expect(rb.items.map((i) => i.title)).toContain("shared-song");
  });

  it("a malformed swipe timestamp keeps the song excluded (defensive — does not crash)", async () => {
    const userId = "u-context-5";
    const swipes = new FakeSwipesRepo();
    const queues = new FakeQueueRepo();

    const malformedSnap = snapshot("malformed-at");
    queues.queues.set(userId, {
      id: "q1",
      userId,
      items: [malformedSnap, snapshot("ok")],
      phase: "discovery",
      generatedAt: TUE_EVENING,
      swipesSeenAtBuild: 0,
    });
    swipes.swipes.push({
      userId,
      snapshot: malformedSnap,
      snapshotHash: computeSnapshotHash(malformedSnap),
      direction: "right",
      at: new Date("not-a-date"),
    });

    const { builder } = makeBuilder({ swipes, queues });

    const response = await builder.getNext(userId, 20);
    const titles = response.items.map((i) => i.title);
    expect(titles).not.toContain("malformed-at");
    expect(titles).toContain("ok");
  });

  it("maybeRefill does NOT trigger when many items are right-swiped only at other slots (right-swipes burn the slot only)", async () => {
    const userId = "u-refill-1";
    const items = Array.from({ length: 20 }, (_, i) => snapshot(`song-${i}`));
    const swipes = new FakeSwipesRepo();
    const queues = new FakeQueueRepo();

    queues.queues.set(userId, {
      id: "q1",
      userId,
      items,
      phase: "discovery",
      generatedAt: TUE_EVENING,
      swipesSeenAtBuild: 0,
    });
    // All 20 items have right-swipes at WED_MORNING (different slot from now).
    // Under asymmetric eligibility (LOGIC-41), right-swipes burn only their
    // own slot — at (tue, evening) all 20 remain eligible. Refill must NOT
    // trigger.
    for (const item of items) {
      swipes.swipes.push({
        userId,
        snapshot: item,
        snapshotHash: computeSnapshotHash(item),
        direction: "right",
        at: WED_MORNING,
      });
    }

    const { builder } = makeBuilder({ swipes, queues });
    const rebuildSpy = vi.spyOn(builder, "rebuildQueue").mockResolvedValue();

    await builder.maybeRefill(userId);
    await Promise.resolve();
    await Promise.resolve();

    expect(rebuildSpy).not.toHaveBeenCalled();
  });

  it("maybeRefill DOES trigger when ≥16 items are slot-burnt at the current slot", async () => {
    const userId = "u-refill-2";
    const items = Array.from({ length: 20 }, (_, i) => snapshot(`song-${i}`));
    const swipes = new FakeSwipesRepo();
    const queues = new FakeQueueRepo();

    queues.queues.set(userId, {
      id: "q1",
      userId,
      items,
      phase: "discovery",
      generatedAt: TUE_EVENING,
      swipesSeenAtBuild: 0,
    });
    // 16 items swiped at the *current* slot — slot-eligible drops to 4.
    for (const item of items.slice(0, 16)) {
      swipes.swipes.push({
        userId,
        snapshot: item,
        snapshotHash: computeSnapshotHash(item),
        direction: "right",
        at: TUE_EVENING,
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

describe("API-25 (asymmetric per LOGIC-41): left-swipes burn forever, right-swipes burn only their slot", () => {
  // Anchor "now" so the slot is stable across tests in this block.
  const TUE_EVENING_ASYM = new Date(2026, 4, 19, 19, 30);
  const WED_MORNING_ASYM = new Date(2026, 4, 20, 9, 0);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(TUE_EVENING_ASYM);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("a LEFT-swipe at a different slot still excludes the song from /next at the current slot (forever burn)", async () => {
    const userId = "u-asym-1";
    const swipes = new FakeSwipesRepo();
    const queues = new FakeQueueRepo();

    const leftSwiped = snapshot("left-elsewhere");
    queues.queues.set(userId, {
      id: "q1",
      userId,
      items: [leftSwiped, snapshot("ok")],
      phase: "discovery",
      generatedAt: TUE_EVENING_ASYM,
      swipesSeenAtBuild: 0,
    });
    // Left-swipe happened at WED_MORNING — under the OLD symmetric rule
    // this would only burn WED_MORNING and the song would still appear at
    // TUE_EVENING. Under LOGIC-41 the left-swipe forever-excludes.
    swipes.swipes.push({
      userId,
      snapshot: leftSwiped,
      snapshotHash: computeSnapshotHash(leftSwiped),
      direction: "left",
      at: WED_MORNING_ASYM,
    });

    const { builder } = makeBuilder({ swipes, queues });

    const response = await builder.getNext(userId, 20);
    const titles = response.items.map((i) => i.title);
    expect(titles).not.toContain("left-elsewhere");
    expect(titles).toContain("ok");
  });

  it("a RIGHT-swipe at a different slot keeps the song eligible at the current slot (slot-only burn)", async () => {
    const userId = "u-asym-2";
    const swipes = new FakeSwipesRepo();
    const queues = new FakeQueueRepo();

    const rightSwiped = snapshot("right-elsewhere");
    queues.queues.set(userId, {
      id: "q1",
      userId,
      items: [rightSwiped, snapshot("ok")],
      phase: "discovery",
      generatedAt: TUE_EVENING_ASYM,
      swipesSeenAtBuild: 0,
    });
    swipes.swipes.push({
      userId,
      snapshot: rightSwiped,
      snapshotHash: computeSnapshotHash(rightSwiped),
      direction: "right",
      at: WED_MORNING_ASYM,
    });

    const { builder } = makeBuilder({ swipes, queues });

    const response = await builder.getNext(userId, 20);
    const titles = response.items.map((i) => i.title);
    expect(titles).toContain("right-elsewhere");
  });

  it("maybeRefill DOES trigger when items are LEFT-swiped at other slots (forever exclusion drops eligible count)", async () => {
    const userId = "u-asym-3";
    const items = Array.from({ length: 20 }, (_, i) => snapshot(`song-${i}`));
    const swipes = new FakeSwipesRepo();
    const queues = new FakeQueueRepo();

    queues.queues.set(userId, {
      id: "q1",
      userId,
      items,
      phase: "discovery",
      generatedAt: TUE_EVENING_ASYM,
      swipesSeenAtBuild: 0,
    });
    // 18 of 20 items left-swiped at WED_MORNING — eligible drops to 2
    // (< REFILL_THRESHOLD of 5). Refill must trigger.
    for (const item of items.slice(0, 18)) {
      swipes.swipes.push({
        userId,
        snapshot: item,
        snapshotHash: computeSnapshotHash(item),
        direction: "left",
        at: WED_MORNING_ASYM,
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

describe("API-30: soft-suppress artists with ≥ 2 left-swipes from rebuild candidate pool", () => {
  it("no queue item carries an artist with ≥ 2 left-swipes (case-insensitive)", async () => {
    const userId = "u-soft-1";
    const swipes = new FakeSwipesRepo();
    const queues = new FakeQueueRepo();
    const profilesRepo = new FakeTasteProfilesRepo();

    // Two left-swipes on Skrillex tracks → Skrillex is suppressed.
    for (const t of ["Bangarang", "Scary Monsters"]) {
      const s = snapshot(t, "Skrillex");
      swipes.swipes.push({
        userId,
        snapshot: s,
        snapshotHash: computeSnapshotHash(s),
        direction: "left",
        at: new Date(),
      });
    }

    // Mock the cold-start LLM to return Skrillex + Deadmau5 tracks in the
    // pool — the pool would normally surface Skrillex, but the soft-suppress
    // filter must strip it before persistence.
    const noopAnthropic = {
      complete: vi.fn().mockResolvedValue({
        text: JSON.stringify({
          songs: [
            { title: "Strobe", artist: "Deadmau5" },
            { title: "First of the Year", artist: "Skrillex" },
            { title: "Ghosts 'n Stuff", artist: "Deadmau5" },
          ],
        }),
      }),
    };
    const noopAudius = { search: vi.fn().mockResolvedValue([]) };
    const noopSoundCloud = { search: vi.fn().mockResolvedValue([]) };
    const noopSearch = {
      search: vi.fn().mockImplementation(async (q: string) => {
        // Cover-resolution lookup: pretend everything has a cover.
        const [title, ...artistParts] = q.split(" ");
        return {
          results: [
            {
              type: "track" as const,
              id: `r-${title}`,
              title: title ?? "",
              artist: artistParts.join(" "),
              provider: "deezer" as const,
              providerId: "p",
              sources: ["deezer" as const],
              artworkUrl: "https://cdn/cover.jpg",
            },
          ],
          partial: false,
          failedProviders: [],
          cached: false,
        };
      }),
    };
    const noopPlay = { resolve: vi.fn().mockResolvedValue({}) };
    const noopInterestScores = { sampleByScoreBucket: vi.fn().mockResolvedValue([]) };
    const fakeConfig = { get: vi.fn().mockReturnValue("claude-sonnet-4-6") };

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
      noopInterestScores as never,
      noopPlay as never,
      fakeConfig as never,
    );

    await builder.rebuildQueue(userId);

    const persisted = queues.queues.get(userId);
    expect(persisted).toBeDefined();
    const artists = (persisted?.items ?? []).map((i) => i.artist.trim().toLowerCase());
    expect(artists).not.toContain("skrillex");
  });
});

describe("API-31: every /api/explore/next response contains at most 2 items per artist (case-insensitive)", () => {
  it("a cold-start pool with 5 tracks by the same artist is capped to 2 in the persisted queue", async () => {
    const userId = "u-cap-1";
    const swipes = new FakeSwipesRepo();
    const queues = new FakeQueueRepo();
    const profilesRepo = new FakeTasteProfilesRepo();

    // Cold-start LLM returns 5 tracks by Skrillex + 2 tracks by Deadmau5.
    // Per-artist cap (LOGIC-43) must drop Skrillex to 2 in the persisted queue.
    const noopAnthropic = {
      complete: vi.fn().mockResolvedValue({
        text: JSON.stringify({
          songs: [
            { title: "Bangarang", artist: "Skrillex" },
            { title: "Scary Monsters", artist: "Skrillex" },
            { title: "First of the Year", artist: "Skrillex" },
            { title: "Kyoto", artist: "Skrillex" },
            { title: "Rock n Roll", artist: "Skrillex" },
            { title: "Strobe", artist: "Deadmau5" },
            { title: "Ghosts 'n Stuff", artist: "Deadmau5" },
          ],
        }),
      }),
    };
    const noopAudius = { search: vi.fn().mockResolvedValue([]) };
    const noopSoundCloud = { search: vi.fn().mockResolvedValue([]) };
    const noopSearch = {
      search: vi.fn().mockImplementation(async (q: string) => {
        const [title, ...artistParts] = q.split(" ");
        return {
          results: [
            {
              type: "track" as const,
              id: `r-${title}`,
              title: title ?? "",
              artist: artistParts.join(" "),
              provider: "deezer" as const,
              providerId: "p",
              sources: ["deezer" as const],
              artworkUrl: "https://cdn/cover.jpg",
            },
          ],
          partial: false,
          failedProviders: [],
          cached: false,
        };
      }),
    };
    const noopPlay = { resolve: vi.fn().mockResolvedValue({}) };
    const noopInterestScores = { sampleByScoreBucket: vi.fn().mockResolvedValue([]) };
    const fakeConfig = { get: vi.fn().mockReturnValue("claude-sonnet-4-6") };

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
      noopInterestScores as never,
      noopPlay as never,
      fakeConfig as never,
    );

    await builder.rebuildQueue(userId);

    const persisted = queues.queues.get(userId);
    expect(persisted).toBeDefined();
    const counts = new Map<string, number>();
    for (const item of persisted?.items ?? []) {
      const key = item.artist.trim().toLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    for (const [artist, n] of counts) {
      expect(n, `expected <= 2 tracks by ${artist}, got ${n}`).toBeLessThanOrEqual(2);
    }
    expect(counts.get("skrillex")).toBe(2);
    expect(counts.get("deadmau5")).toBe(2);
  });

  it("the /next response also exposes at most 2 items per artist (downstream filter cannot increase the count)", async () => {
    const userId = "u-cap-2";
    const swipes = new FakeSwipesRepo();
    const queues = new FakeQueueRepo();

    // Pre-populate a queue with 5 Skrillex items — simulating a stale queue
    // built before the cap was enforced. /next must still enforce the cap.
    queues.queues.set(userId, {
      id: "q1",
      userId,
      items: [
        snapshot("Bangarang", "Skrillex"),
        snapshot("Scary Monsters", "Skrillex"),
        snapshot("First of the Year", "Skrillex"),
        snapshot("Kyoto", "Skrillex"),
        snapshot("Rock n Roll", "Skrillex"),
        snapshot("Strobe", "Deadmau5"),
      ],
      phase: "discovery",
      generatedAt: new Date(),
      swipesSeenAtBuild: 0,
    });

    const { builder } = makeBuilder({ swipes, queues });

    const response = await builder.getNext(userId, 20);
    const counts = new Map<string, number>();
    for (const item of response.items) {
      const key = item.artist.trim().toLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    expect(counts.get("skrillex") ?? 0).toBeLessThanOrEqual(2);
  });
});
