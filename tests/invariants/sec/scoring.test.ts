// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under SEC-13.

import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import {
  buildExploreEventsTestApp,
  makeSnapshot,
  type ExploreEventsTestAppHandle,
} from "../_helpers/explore-events-test-app.js";
import {
  buildSearchEventsTestApp,
  type SearchEventsTestAppHandle,
} from "../_helpers/search-events-test-app.js";
import {
  buildPlayEventsTestApp,
  type PlayEventsTestAppHandle,
} from "../_helpers/play-events-test-app.js";

describe("SEC-13: scoring writes are scoped to the authenticated session's userId", () => {
  let exploreH: ExploreEventsTestAppHandle | undefined;
  let searchH: SearchEventsTestAppHandle | undefined;
  let playH: PlayEventsTestAppHandle | undefined;
  afterEach(async () => {
    if (exploreH) await exploreH.app.close();
    if (searchH) await searchH.app.close();
    if (playH) await playH.app.close();
    exploreH = undefined;
    searchH = undefined;
    playH = undefined;
  });

  async function waitForCalls<T>(getter: () => T[], min = 1): Promise<void> {
    // Fire-and-forget calls schedule on the microtask queue; flush by
    // letting the event loop turn at least once. A short retry loop
    // guards against any task being pushed to a later tick.
    for (let i = 0; i < 50; i++) {
      if (getter().length >= min) return;
      await new Promise((r) => setImmediate(r));
    }
  }

  it("a right-swipe by user A writes context_scores rows tagged with A's userId only", async () => {
    exploreH = await buildExploreEventsTestApp();
    const userA = "550e8400-e29b-41d4-a716-446655440c01";
    const tokenA = exploreH.authService.signSession({ uid: userA, gid: "g_scoring_a" });
    await request(exploreH.app.getHttpServer())
      .post("/api/explore/swipe")
      .set("Cookie", `session=${tokenA}`)
      .send({ snapshot: makeSnapshot(), direction: "right" })
      .expect(204);
    await waitForCalls(() => exploreH!.scoring.swipeCalls);
    expect(exploreH.scoring.swipeCalls).toHaveLength(1);
    expect(exploreH.scoring.swipeCalls[0]!.userId).toBe(userA);
  });

  it("a swipe body that smuggles userId=B for an A-session never reaches the scoring service", async () => {
    exploreH = await buildExploreEventsTestApp();
    const userA = "550e8400-e29b-41d4-a716-446655440c02";
    const userB = "550e8400-e29b-41d4-a716-446655440c99";
    const tokenA = exploreH.authService.signSession({ uid: userA, gid: "g_scoring_smuggle" });
    await request(exploreH.app.getHttpServer())
      .post("/api/explore/swipe")
      .set("Cookie", `session=${tokenA}`)
      .send({ userId: userB, snapshot: makeSnapshot(), direction: "right" })
      .expect(204);
    await waitForCalls(() => exploreH!.scoring.swipeCalls);
    expect(exploreH.scoring.swipeCalls.every((c) => c.userId === userA)).toBe(true);
    expect(exploreH.scoring.swipeCalls.some((c) => c.userId === userB)).toBe(false);
  });

  it("a save event by user A never writes a context_scores row tagged with B's userId", async () => {
    searchH = await buildSearchEventsTestApp();
    const userA = "550e8400-e29b-41d4-a716-446655440c10";
    const userB = "550e8400-e29b-41d4-a716-446655440caa";
    const tokenA = searchH.authService.signSession({ uid: userA, gid: "g_scoring_save" });
    await request(searchH.app.getHttpServer())
      .post("/api/search/saved")
      .set("Cookie", `session=${tokenA}`)
      .send({
        userId: userB,
        source: "deezer",
        externalId: "deezer-123",
        snapshot: { title: "Saved Song", artist: "Saved Artist", kind: "track" },
      })
      .expect(204);
    await waitForCalls(() => searchH!.scoring.saveCalls);
    expect(searchH.scoring.saveCalls.every((c) => c.userId === userA)).toBe(true);
    expect(searchH.scoring.saveCalls.some((c) => c.userId === userB)).toBe(false);
  });

  it("a listen-completed event by user A never writes a context_scores row tagged with B's userId", async () => {
    playH = await buildPlayEventsTestApp();
    const userA = "550e8400-e29b-41d4-a716-446655440c20";
    const userB = "550e8400-e29b-41d4-a716-446655440cbb";
    const tokenA = playH.authService.signSession({ uid: userA, gid: "g_scoring_listen" });
    await request(playH.app.getHttpServer())
      .post("/api/play/completed")
      .set("Cookie", `session=${tokenA}`)
      .send({
        userId: userB,
        source: "deezer",
        externalId: "deezer-456",
        snapshot: {
          title: "Listened",
          artist: "Listener",
          kind: "track",
          durationSec: 200,
        },
        elapsedMs: 150000,
      })
      .expect(204);
    await waitForCalls(() => playH!.scoring.listenCompletedCalls);
    expect(playH.scoring.listenCompletedCalls.every((c) => c.userId === userA)).toBe(true);
    expect(playH.scoring.listenCompletedCalls.some((c) => c.userId === userB)).toBe(false);
  });
});
