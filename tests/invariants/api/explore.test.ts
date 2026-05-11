// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under API-14, API-15, API-16, API-17.

import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import { ErrorResponse, NextResponse, TasteProfile } from "@moc/contracts";
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
  let h: ExploreEventsTestAppHandle | undefined;
  afterEach(async () => {
    if (h) await h.app.close();
    h = undefined;
  });

  it("returns 401 + ErrorResponse without a session cookie", async () => {
    h = await buildExploreEventsTestApp();
    const res = await request(h.app.getHttpServer()).get("/api/explore/profile");
    expect(res.status).toBe(401);
    expect(() => ErrorResponse.parse(res.body)).not.toThrow();
  });

  it("returns 200 with body null for a user below the build threshold", async () => {
    h = await buildExploreEventsTestApp();
    const userId = "550e8400-e29b-41d4-a716-446655440600";
    const token = h.authService.signSession({ uid: userId, gid: "g_profile_empty" });
    const res = await request(h.app.getHttpServer())
      .get("/api/explore/profile")
      .set("Cookie", `session=${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });

  it("returns 200 with a body matching TasteProfile when a profile has been built for the session user", async () => {
    h = await buildExploreEventsTestApp();
    const userId = "550e8400-e29b-41d4-a716-446655440601";
    const token = h.authService.signSession({ uid: userId, gid: "g_profile_built" });
    h.profileBuilder.profilesByUser.set(userId, {
      userId,
      genres: [{ name: "drum-and-bass", score: 0.92 }],
      artists: [{ name: "Andy C", score: 0.88 }],
      tempoBucket: "fast",
      remixPreference: "remix-friendly",
      summaryText: "you tend to like high-tempo dnb tracks",
      lastBuiltAt: "2026-05-10T00:00:00.000Z",
      swipeCountAtLastBuild: 20,
    });
    const res = await request(h.app.getHttpServer())
      .get("/api/explore/profile")
      .set("Cookie", `session=${token}`);
    expect(res.status).toBe(200);
    expect(() => TasteProfile.parse(res.body)).not.toThrow();
    expect(res.body.userId).toBe(userId);
  });
});

describe("API-16: GET /api/explore/next contract — auth, NextResponse shape, count clamping, LLM degradation", () => {
  let h: ExploreEventsTestAppHandle | undefined;
  afterEach(async () => {
    if (h) await h.app.close();
    h = undefined;
  });

  it("returns 401 + ErrorResponse without a session cookie", async () => {
    h = await buildExploreEventsTestApp();
    const res = await request(h.app.getHttpServer()).get("/api/explore/next");
    expect(res.status).toBe(401);
    expect(() => ErrorResponse.parse(res.body)).not.toThrow();
  });

  it("returns 200 with a body matching NextResponse for a fresh user", async () => {
    h = await buildExploreEventsTestApp();
    const userId = "550e8400-e29b-41d4-a716-446655440801";
    const token = h.authService.signSession({ uid: userId, gid: "g_next_fresh" });
    h.queueBuilder.queuesByUser.set(userId, {
      items: Array.from({ length: 20 }, (_, i) =>
        makeSnapshot({ title: `Seed ${i}`, artist: `Artist ${i}` }),
      ),
      phase: "discovery",
    });
    const res = await request(h.app.getHttpServer())
      .get("/api/explore/next")
      .set("Cookie", `session=${token}`);
    expect(res.status).toBe(200);
    expect(() => NextResponse.parse(res.body)).not.toThrow();
    expect(res.body.phase).toBe("discovery");
    expect(res.body.items).toHaveLength(20);
    expect(res.body.partial).toBe(false);
  });

  it("count defaults to 20 when omitted", async () => {
    h = await buildExploreEventsTestApp();
    const userId = "550e8400-e29b-41d4-a716-446655440802";
    const token = h.authService.signSession({ uid: userId, gid: "g_next_default" });
    h.queueBuilder.queuesByUser.set(userId, {
      items: Array.from({ length: 30 }, (_, i) =>
        makeSnapshot({ title: `T${i}`, artist: `A${i}` }),
      ),
      phase: "discovery",
    });
    const res = await request(h.app.getHttpServer())
      .get("/api/explore/next")
      .set("Cookie", `session=${token}`);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(20);
  });

  it("count is clamped to a maximum of 50", async () => {
    h = await buildExploreEventsTestApp();
    const userId = "550e8400-e29b-41d4-a716-446655440803";
    const token = h.authService.signSession({ uid: userId, gid: "g_next_clamp_max" });
    h.queueBuilder.queuesByUser.set(userId, {
      items: Array.from({ length: 100 }, (_, i) =>
        makeSnapshot({ title: `T${i}`, artist: `A${i}` }),
      ),
      phase: "discovery",
    });
    const res = await request(h.app.getHttpServer())
      .get("/api/explore/next?count=999")
      .set("Cookie", `session=${token}`);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(50);
  });

  it("count is clamped to at least 1", async () => {
    h = await buildExploreEventsTestApp();
    const userId = "550e8400-e29b-41d4-a716-446655440804";
    const token = h.authService.signSession({ uid: userId, gid: "g_next_clamp_min" });
    h.queueBuilder.queuesByUser.set(userId, {
      items: [makeSnapshot({ title: "T0", artist: "A0" })],
      phase: "discovery",
    });
    const res = await request(h.app.getHttpServer())
      .get("/api/explore/next?count=0")
      .set("Cookie", `session=${token}`);
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThanOrEqual(1);
  });
});

describe("API-17: GET /api/explore/next returns only items with a non-empty coverUrl", () => {
  let h: ExploreEventsTestAppHandle | undefined;
  afterEach(async () => {
    if (h) await h.app.close();
    h = undefined;
  });

  it("with a fully covered queue, every items[i].coverUrl is a non-empty string", async () => {
    h = await buildExploreEventsTestApp();
    const userId = "550e8400-e29b-41d4-a716-446655440a01";
    const token = h.authService.signSession({ uid: userId, gid: "g_cov_a01" });
    h.queueBuilder.queuesByUser.set(userId, {
      items: [
        makeSnapshot({ title: "A", artist: "Y", coverUrl: "https://cdn/a.jpg" }),
        makeSnapshot({ title: "B", artist: "Y", coverUrl: "https://cdn/b.jpg" }),
        makeSnapshot({ title: "C", artist: "Y", coverUrl: "https://cdn/c.jpg" }),
      ],
      phase: "discovery",
    });
    const res = await request(h.app.getHttpServer())
      .get("/api/explore/next?count=20")
      .set("Cookie", `session=${token}`);
    expect(res.status).toBe(200);
    expect(() => NextResponse.parse(res.body)).not.toThrow();
    expect(res.body.items.length).toBe(3);
    for (const item of res.body.items) {
      expect(typeof item.coverUrl).toBe("string");
      expect(item.coverUrl.length).toBeGreaterThan(0);
    }
  });

  it("never surfaces a cover-less item even if one is artificially planted (defense-in-depth)", async () => {
    h = await buildExploreEventsTestApp();
    const userId = "550e8400-e29b-41d4-a716-446655440a02";
    const token = h.authService.signSession({ uid: userId, gid: "g_cov_a02" });
    // Plant a mixed queue: two covered, two cover-less. The endpoint
    // must drop the latter regardless of how they got persisted.
    h.queueBuilder.queuesByUser.set(userId, {
      items: [
        makeSnapshot({ title: "Covered1", artist: "X", coverUrl: "https://cdn/1.jpg" }),
        makeSnapshot({ title: "Bare1", artist: "X", coverUrl: "" }),
        makeSnapshot({ title: "Covered2", artist: "X", coverUrl: "https://cdn/2.jpg" }),
        makeSnapshot({ title: "Bare2", artist: "X", coverUrl: "" }),
      ],
      phase: "discovery",
    });
    const res = await request(h.app.getHttpServer())
      .get("/api/explore/next?count=20")
      .set("Cookie", `session=${token}`);
    expect(res.status).toBe(200);
    const titles = res.body.items.map((s: { title: string }) => s.title);
    expect(titles).not.toContain("Bare1");
    expect(titles).not.toContain("Bare2");
    expect(titles).toContain("Covered1");
    expect(titles).toContain("Covered2");
    for (const item of res.body.items) {
      expect(item.coverUrl?.length).toBeGreaterThan(0);
    }
  });

  it("returns an empty (but valid) NextResponse when every queued item is cover-less", async () => {
    h = await buildExploreEventsTestApp();
    const userId = "550e8400-e29b-41d4-a716-446655440a03";
    const token = h.authService.signSession({ uid: userId, gid: "g_cov_a03" });
    h.queueBuilder.queuesByUser.set(userId, {
      items: [
        makeSnapshot({ title: "Bare1", artist: "X", coverUrl: "" }),
        makeSnapshot({ title: "Bare2", artist: "X", coverUrl: "" }),
      ],
      phase: "discovery",
    });
    const res = await request(h.app.getHttpServer())
      .get("/api/explore/next?count=20")
      .set("Cookie", `session=${token}`);
    expect(res.status).toBe(200);
    expect(() => NextResponse.parse(res.body)).not.toThrow();
    expect(res.body.items).toEqual([]);
  });
});
