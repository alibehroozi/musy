// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under API-14, API-15.

import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import { ErrorResponse } from "@moc/contracts";
import {
  buildExploreEventsTestApp,
  makeSnapshot,
  type ExploreEventsTestAppHandle,
} from "../_helpers/explore-events-test-app.js";

const VALID_RIGHT_BODY = {
  snapshot: { title: "Bohemian Rhapsody", artist: "Queen", kind: "track" as const },
  direction: "right" as const,
};

const VALID_LEFT_BODY = {
  snapshot: { title: "Bohemian Rhapsody", artist: "Queen", kind: "track" as const },
  direction: "left" as const,
};

describe("API-14: POST /api/explore/swipe contract — auth, body validation, ledger + score side effects", () => {
  let h: ExploreEventsTestAppHandle | undefined;
  afterEach(async () => {
    if (h) await h.app.close();
    h = undefined;
  });

  it("returns 401 + ErrorResponse without a session cookie", async () => {
    h = await buildExploreEventsTestApp();
    const res = await request(h.app.getHttpServer())
      .post("/api/explore/swipe")
      .send(VALID_RIGHT_BODY)
      .set("Content-Type", "application/json");
    expect(res.status).toBe(401);
    expect(() => ErrorResponse.parse(res.body)).not.toThrow();
  });

  it("returns 400 + ErrorResponse when the body is empty", async () => {
    h = await buildExploreEventsTestApp();
    const userId = "550e8400-e29b-41d4-a716-446655440400";
    const token = h.authService.signSession({ uid: userId, gid: "g_swipe_empty_body" });
    const res = await request(h.app.getHttpServer())
      .post("/api/explore/swipe")
      .send({})
      .set("Content-Type", "application/json")
      .set("Cookie", `session=${token}`);
    expect(res.status).toBe(400);
    expect(() => ErrorResponse.parse(res.body)).not.toThrow();
  });

  it("returns 400 + ErrorResponse when direction is not 'right' or 'left'", async () => {
    h = await buildExploreEventsTestApp();
    const userId = "550e8400-e29b-41d4-a716-446655440401";
    const token = h.authService.signSession({ uid: userId, gid: "g_swipe_bad_dir" });
    const res = await request(h.app.getHttpServer())
      .post("/api/explore/swipe")
      .send({ snapshot: makeSnapshot(), direction: "up" })
      .set("Content-Type", "application/json")
      .set("Cookie", `session=${token}`);
    expect(res.status).toBe(400);
    expect(() => ErrorResponse.parse(res.body)).not.toThrow();
  });

  it("returns 400 + ErrorResponse when snapshot is missing required fields", async () => {
    h = await buildExploreEventsTestApp();
    const userId = "550e8400-e29b-41d4-a716-446655440402";
    const token = h.authService.signSession({ uid: userId, gid: "g_swipe_bad_snap" });
    const res = await request(h.app.getHttpServer())
      .post("/api/explore/swipe")
      .send({ snapshot: { title: "" }, direction: "right" })
      .set("Content-Type", "application/json")
      .set("Cookie", `session=${token}`);
    expect(res.status).toBe(400);
    expect(() => ErrorResponse.parse(res.body)).not.toThrow();
  });

  it("returns 204 with no body for a valid right-swipe; writes one swipes doc and upserts interest_scores >= 8", async () => {
    h = await buildExploreEventsTestApp();
    const userId = "550e8400-e29b-41d4-a716-446655440410";
    const token = h.authService.signSession({ uid: userId, gid: "g_swipe_right_ok" });
    const res = await request(h.app.getHttpServer())
      .post("/api/explore/swipe")
      .send(VALID_RIGHT_BODY)
      .set("Content-Type", "application/json")
      .set("Cookie", `session=${token}`);
    expect(res.status).toBe(204);
    expect(res.body).toEqual({});

    const swipes = await h.swipesRepo.findSwipesForUser(userId);
    expect(swipes).toHaveLength(1);
    expect(swipes[0]!.direction).toBe("right");
    expect(typeof swipes[0]!.snapshotHash).toBe("string");
    expect(swipes[0]!.snapshotHash.length).toBeGreaterThan(0);

    const scores = await h.interestRepo.findScoresForUser(userId);
    expect(scores).toHaveLength(1);
    expect(scores[0]!.score).toBeGreaterThanOrEqual(8);
  });

  it("returns 204 for a valid left-swipe; writes one swipes doc but does not create or modify interest_scores", async () => {
    h = await buildExploreEventsTestApp();
    const userId = "550e8400-e29b-41d4-a716-446655440411";
    const token = h.authService.signSession({ uid: userId, gid: "g_swipe_left_ok" });
    const res = await request(h.app.getHttpServer())
      .post("/api/explore/swipe")
      .send(VALID_LEFT_BODY)
      .set("Content-Type", "application/json")
      .set("Cookie", `session=${token}`);
    expect(res.status).toBe(204);

    const swipes = await h.swipesRepo.findSwipesForUser(userId);
    expect(swipes).toHaveLength(1);
    expect(swipes[0]!.direction).toBe("left");

    const scores = await h.interestRepo.findScoresForUser(userId);
    expect(scores).toHaveLength(0);
  });

  it("two consecutive right-swipes on the same snapshot create two ledger entries and leave interest_scores.score at 8 (monotonic)", async () => {
    h = await buildExploreEventsTestApp();
    const userId = "550e8400-e29b-41d4-a716-446655440412";
    const token = h.authService.signSession({ uid: userId, gid: "g_swipe_right_dupe" });
    for (let i = 0; i < 2; i++) {
      const res = await request(h.app.getHttpServer())
        .post("/api/explore/swipe")
        .send(VALID_RIGHT_BODY)
        .set("Content-Type", "application/json")
        .set("Cookie", `session=${token}`);
      expect(res.status).toBe(204);
    }
    const swipes = await h.swipesRepo.findSwipesForUser(userId);
    expect(swipes).toHaveLength(2);
    const scores = await h.interestRepo.findScoresForUser(userId);
    expect(scores).toHaveLength(1);
    expect(scores[0]!.score).toBe(8);
  });
});

describe("API-15: GET /api/explore/profile contract — auth gating + TasteProfileResponse shape", () => {
  it.todo("returns 401 + ErrorResponse without a session cookie");
  it.todo("returns 200 with body null for a user below the build threshold");
  it.todo(
    "returns 200 with a body matching TasteProfile when a profile has been built for the session user",
  );
});
