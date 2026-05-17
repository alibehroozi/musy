// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under API-24, API-28.

import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import { ErrorResponse, TasteBucketsResponse } from "@moc/contracts";
import {
  buildTasteTestApp,
  makeBucket,
  type TasteTestAppHandle,
} from "../_helpers/taste-test-app.js";

describe("API-24: GET /api/me/taste/profile contract — auth, body shape, no Mongo leakage", () => {
  let h: TasteTestAppHandle | undefined;
  afterEach(async () => {
    if (h) await h.app.close();
    h = undefined;
  });

  it("returns 401 + ErrorResponse without a session cookie", async () => {
    h = await buildTasteTestApp();
    const res = await request(h.app.getHttpServer()).get("/api/me/taste/profile");
    expect(res.status).toBe(401);
    expect(() => ErrorResponse.parse(res.body)).not.toThrow();
  });

  it("returns 200 + { buckets: [] } for a user with no buckets", async () => {
    h = await buildTasteTestApp();
    const userId = "550e8400-e29b-41d4-a716-446655440a00";
    const token = h.authService.signSession({ uid: userId, gid: "g_taste_empty" });
    const res = await request(h.app.getHttpServer())
      .get("/api/me/taste/profile")
      .set("Cookie", `session=${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ buckets: [] });
    expect(() => TasteBucketsResponse.parse(res.body)).not.toThrow();
  });

  it("returns 200 + a TasteBucketsResponse-conforming body listing the user's buckets", async () => {
    h = await buildTasteTestApp();
    const userId = "550e8400-e29b-41d4-a716-446655440a01";
    const token = h.authService.signSession({ uid: userId, gid: "g_taste_two_buckets" });
    h.bucketsRepo.bucketsByUser.set(userId, [
      makeBucket({ id: "b-1", userId, name: "Late-night drives", kind: "auto" }),
      makeBucket({
        id: "b-2",
        userId,
        name: "Yacht rock summer",
        kind: "custom",
        promptText: "yacht rock for the summer",
      }),
    ]);
    const res = await request(h.app.getHttpServer())
      .get("/api/me/taste/profile")
      .set("Cookie", `session=${token}`);
    expect(res.status).toBe(200);
    expect(() => TasteBucketsResponse.parse(res.body)).not.toThrow();
    const parsed = TasteBucketsResponse.parse(res.body);
    expect(parsed.buckets).toHaveLength(2);
    expect(parsed.buckets.map((b) => b.id)).toEqual(["b-1", "b-2"]);
    expect(parsed.buckets[1]!.promptText).toBe("yacht rock for the summer");
  });

  it("response carries no Mongo internals (_id, __v) and no fields outside the contract", async () => {
    h = await buildTasteTestApp();
    const userId = "550e8400-e29b-41d4-a716-446655440a02";
    const token = h.authService.signSession({ uid: userId, gid: "g_taste_no_internals" });
    h.bucketsRepo.bucketsByUser.set(userId, [makeBucket({ userId })]);
    const res = await request(h.app.getHttpServer())
      .get("/api/me/taste/profile")
      .set("Cookie", `session=${token}`);
    expect(res.status).toBe(200);
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toMatch(/"_id"\s*:/);
    expect(serialized).not.toMatch(/"__v"\s*:/);
    // Body keys are exactly { buckets } at the top level.
    expect(Object.keys(res.body as object)).toEqual(["buckets"]);
  });
});

describe("API-28: GET /api/me/taste/profile carries server-computed coverArtworkUrl per bucket", () => {
  let h: TasteTestAppHandle | undefined;
  afterEach(async () => {
    if (h) await h.app.close();
    h = undefined;
  });

  // Minimal BucketSongScoresDocument-shaped object — the service only
  // reads `score`, `songKey`, and `snapshot.coverUrl`. The repository
  // fake type-coerces, so unused fields stay out of the way.
  function row(input: {
    userId: string;
    bucketId: string;
    songKey: string;
    score: number;
    coverUrl?: string;
  }): unknown {
    return {
      userId: input.userId,
      bucketId: input.bucketId,
      songKey: input.songKey,
      score: input.score,
      snapshot: {
        title: `t-${input.songKey}`,
        artist: "a",
        kind: "track" as const,
        ...(input.coverUrl !== undefined ? { coverUrl: input.coverUrl } : {}),
      },
      lastUpdatedAt: new Date("2026-05-01T00:00:00.000Z"),
    };
  }

  it("returns the highest-score row's coverUrl as coverArtworkUrl", async () => {
    h = await buildTasteTestApp();
    const userId = "550e8400-e29b-41d4-a716-446655440b00";
    const token = h.authService.signSession({ uid: userId, gid: "g_api28_top" });
    h.bucketsRepo.bucketsByUser.set(userId, [makeBucket({ id: "b-1", userId })]);
    h.bucketSongScoresRepo.setRows(userId, "b-1", [
      row({ userId, bucketId: "b-1", songKey: "s-mid", score: 50, coverUrl: "https://cdn/m.jpg" }),
      row({ userId, bucketId: "b-1", songKey: "s-top", score: 90, coverUrl: "https://cdn/t.jpg" }),
      row({ userId, bucketId: "b-1", songKey: "s-low", score: 10, coverUrl: "https://cdn/l.jpg" }),
      // deliberately untyped — see local `row` helper for shape
    ] as never);
    const res = await request(h.app.getHttpServer())
      .get("/api/me/taste/profile")
      .set("Cookie", `session=${token}`);
    expect(res.status).toBe(200);
    const parsed = TasteBucketsResponse.parse(res.body);
    expect(parsed.buckets[0]!.coverArtworkUrl).toBe("https://cdn/t.jpg");
  });

  it("breaks ties on score by lexicographically smallest songKey", async () => {
    h = await buildTasteTestApp();
    const userId = "550e8400-e29b-41d4-a716-446655440b01";
    const token = h.authService.signSession({ uid: userId, gid: "g_api28_tie" });
    h.bucketsRepo.bucketsByUser.set(userId, [makeBucket({ id: "b-1", userId })]);
    h.bucketSongScoresRepo.setRows(userId, "b-1", [
      row({ userId, bucketId: "b-1", songKey: "z-key", score: 80, coverUrl: "https://cdn/z.jpg" }),
      row({ userId, bucketId: "b-1", songKey: "a-key", score: 80, coverUrl: "https://cdn/a.jpg" }),
      row({ userId, bucketId: "b-1", songKey: "m-key", score: 80, coverUrl: "https://cdn/m.jpg" }),
    ] as never);
    const res = await request(h.app.getHttpServer())
      .get("/api/me/taste/profile")
      .set("Cookie", `session=${token}`);
    expect(res.status).toBe(200);
    const parsed = TasteBucketsResponse.parse(res.body);
    expect(parsed.buckets[0]!.coverArtworkUrl).toBe("https://cdn/a.jpg");
  });

  it("returns null when the top-scored row's snapshot.coverUrl is undefined", async () => {
    h = await buildTasteTestApp();
    const userId = "550e8400-e29b-41d4-a716-446655440b02";
    const token = h.authService.signSession({ uid: userId, gid: "g_api28_no_cover" });
    h.bucketsRepo.bucketsByUser.set(userId, [makeBucket({ id: "b-1", userId })]);
    h.bucketSongScoresRepo.setRows(userId, "b-1", [
      // Top row has no coverUrl.
      row({ userId, bucketId: "b-1", songKey: "s-top", score: 95 }),
      row({ userId, bucketId: "b-1", songKey: "s-low", score: 10, coverUrl: "https://cdn/l.jpg" }),
    ] as never);
    const res = await request(h.app.getHttpServer())
      .get("/api/me/taste/profile")
      .set("Cookie", `session=${token}`);
    expect(res.status).toBe(200);
    const parsed = TasteBucketsResponse.parse(res.body);
    expect(parsed.buckets[0]!.coverArtworkUrl).toBeNull();
  });

  it("returns null when no bucket_song_scores row exists for the bucket", async () => {
    h = await buildTasteTestApp();
    const userId = "550e8400-e29b-41d4-a716-446655440b03";
    const token = h.authService.signSession({ uid: userId, gid: "g_api28_empty" });
    h.bucketsRepo.bucketsByUser.set(userId, [
      makeBucket({ id: "b-building", userId, state: "building" }),
    ]);
    // No rows pushed — emulates a state: "building" bucket without songs yet.
    const res = await request(h.app.getHttpServer())
      .get("/api/me/taste/profile")
      .set("Cookie", `session=${token}`);
    expect(res.status).toBe(200);
    const parsed = TasteBucketsResponse.parse(res.body);
    expect(parsed.buckets[0]!.coverArtworkUrl).toBeNull();
  });

  it("returns null when the top-scored row's coverUrl fails URL parsing", async () => {
    h = await buildTasteTestApp();
    const userId = "550e8400-e29b-41d4-a716-446655440b04";
    const token = h.authService.signSession({ uid: userId, gid: "g_api28_bad_url" });
    h.bucketsRepo.bucketsByUser.set(userId, [makeBucket({ id: "b-1", userId })]);
    h.bucketSongScoresRepo.setRows(userId, "b-1", [
      // Mongo may carry historical malformed data (e.g. a literal "(none)"
      // injected by an earlier upstream parser). The service must not 500.
      row({ userId, bucketId: "b-1", songKey: "s-top", score: 75, coverUrl: "(none)" }),
    ] as never);
    const res = await request(h.app.getHttpServer())
      .get("/api/me/taste/profile")
      .set("Cookie", `session=${token}`);
    expect(res.status).toBe(200);
    const parsed = TasteBucketsResponse.parse(res.body);
    expect(parsed.buckets[0]!.coverArtworkUrl).toBeNull();
  });

  it("scopes the cover-URL join by session userId — A's covers never appear in B's response", async () => {
    h = await buildTasteTestApp();
    const userA = "550e8400-e29b-41d4-a716-446655440b10";
    const userB = "550e8400-e29b-41d4-a716-446655440b11";
    const tokenB = h.authService.signSession({ uid: userB, gid: "g_api28_userB" });

    // User A has a bucket with the same id as B; we prime cover rows ONLY
    // under A's (userId, bucketId) pair. The fake repo keys on userId, so
    // a B-scoped call must see no rows even though "b-shared" matches.
    h.bucketsRepo.bucketsByUser.set(userB, [makeBucket({ id: "b-shared", userId: userB })]);
    h.bucketSongScoresRepo.setRows(userA, "b-shared", [
      row({
        userId: userA,
        bucketId: "b-shared",
        songKey: "leak",
        score: 99,
        coverUrl: "https://cdn/A.jpg",
      }),
    ] as never);
    const res = await request(h.app.getHttpServer())
      .get("/api/me/taste/profile")
      .set("Cookie", `session=${tokenB}`);
    expect(res.status).toBe(200);
    const parsed = TasteBucketsResponse.parse(res.body);
    expect(parsed.buckets[0]!.coverArtworkUrl).toBeNull();
  });
});
