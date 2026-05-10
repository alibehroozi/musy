// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under SEC-09, SEC-10.

import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import {
  buildExploreEventsTestApp,
  type ExploreEventsTestAppHandle,
} from "../_helpers/explore-events-test-app.js";

const VALID_BODY = {
  snapshot: { title: "Bohemian Rhapsody", artist: "Queen", kind: "track" as const },
  direction: "right" as const,
};

describe("SEC-09: /api/explore/swipe always derives userId from the session, never from the body", () => {
  let h: ExploreEventsTestAppHandle | undefined;
  afterEach(async () => {
    if (h) await h.app.close();
    h = undefined;
  });

  it("a body field 'userId' targeting victimId is ignored — the swipe + score upsert land under the session's uid", async () => {
    h = await buildExploreEventsTestApp();
    const sessionUid = "550e8400-e29b-41d4-a716-446655440500";
    const victimId = "550e8400-e29b-41d4-a716-446655440599";
    const token = h.authService.signSession({ uid: sessionUid, gid: "g_explore_smuggle" });
    const res = await request(h.app.getHttpServer())
      .post("/api/explore/swipe")
      .send({ ...VALID_BODY, userId: victimId })
      .set("Content-Type", "application/json")
      .set("Cookie", `session=${token}`);
    expect(res.status).toBe(204);

    expect(await h.swipesRepo.findSwipesForUser(sessionUid)).toHaveLength(1);
    expect(await h.swipesRepo.findSwipesForUser(victimId)).toHaveLength(0);

    expect(await h.interestRepo.findScoresForUser(sessionUid)).toHaveLength(1);
    expect(await h.interestRepo.findScoresForUser(victimId)).toHaveLength(0);
  });

  it("with no session cookie the call is rejected with 401 before any DB write happens", async () => {
    h = await buildExploreEventsTestApp();
    const res = await request(h.app.getHttpServer())
      .post("/api/explore/swipe")
      .send(VALID_BODY)
      .set("Content-Type", "application/json");
    expect(res.status).toBe(401);
    expect(h.swipesRepo.swipes).toHaveLength(0);
    expect(h.interestRepo.docs.size).toBe(0);
  });

  it("user A's swipes / interest_scores writes are scoped to A's userId, not B's", async () => {
    h = await buildExploreEventsTestApp();
    const userA = "550e8400-e29b-41d4-a716-446655440510";
    const userB = "550e8400-e29b-41d4-a716-446655440511";
    const tokenA = h.authService.signSession({ uid: userA, gid: "g_explore_user_a" });
    const tokenB = h.authService.signSession({ uid: userB, gid: "g_explore_user_b" });
    await request(h.app.getHttpServer())
      .post("/api/explore/swipe")
      .send(VALID_BODY)
      .set("Content-Type", "application/json")
      .set("Cookie", `session=${tokenA}`)
      .expect(204);
    await request(h.app.getHttpServer())
      .post("/api/explore/swipe")
      .send({ ...VALID_BODY, direction: "left" })
      .set("Content-Type", "application/json")
      .set("Cookie", `session=${tokenB}`)
      .expect(204);

    const aSwipes = await h.swipesRepo.findSwipesForUser(userA);
    const bSwipes = await h.swipesRepo.findSwipesForUser(userB);
    expect(aSwipes.every((s) => s.userId === userA)).toBe(true);
    expect(bSwipes.every((s) => s.userId === userB)).toBe(true);
    expect(aSwipes.find((s) => s.userId === userB)).toBeUndefined();
    expect(bSwipes.find((s) => s.userId === userA)).toBeUndefined();

    // Right-swipe (A) wrote interest_scores; left-swipe (B) did not.
    const aScores = await h.interestRepo.findScoresForUser(userA);
    const bScores = await h.interestRepo.findScoresForUser(userB);
    expect(aScores.every((d) => d.userId === userA)).toBe(true);
    expect(bScores).toHaveLength(0);
  });
});

describe("SEC-10: GET /api/explore/profile is owner-scoped — user A never sees user B's profile", () => {
  it.todo(
    "with user A's session, the response is the profile written for A — never the one written for B",
  );
  it.todo(
    "the repository read used to serve /profile filters by the authenticated session's userId",
  );
});
