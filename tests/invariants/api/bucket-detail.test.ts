// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under API-29.

import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import { BucketDetailResponse, ErrorResponse } from "@moc/contracts";
import type { BucketSongScoresDocument } from "../../../apps/api/src/modules/taste/bucket-song-scores.schema.js";
import {
  buildTasteTestApp,
  makeBucket,
  type TasteTestAppHandle,
} from "../_helpers/taste-test-app.js";

function scoreRow(input: {
  userId: string;
  bucketId: string;
  songKey: string;
  score: number;
  lastUpdatedAt?: Date;
  coverUrl?: string;
}): BucketSongScoresDocument {
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
    lastUpdatedAt: input.lastUpdatedAt ?? new Date("2026-05-01T00:00:00.000Z"),
  } as unknown as BucketSongScoresDocument;
}

describe("API-29: GET /api/me/taste/buckets/:bucketId contract", () => {
  let h: TasteTestAppHandle | undefined;
  afterEach(async () => {
    if (h) await h.app.close();
    h = undefined;
  });

  it("returns 401 + ErrorResponse without a session cookie", async () => {
    h = await buildTasteTestApp();
    const res = await request(h.app.getHttpServer()).get("/api/me/taste/buckets/some-bucket-id");
    expect(res.status).toBe(401);
    expect(() => ErrorResponse.parse(res.body)).not.toThrow();
  });

  it("returns 200 + a BucketDetailResponse-conforming body with { bucket, songs }", async () => {
    h = await buildTasteTestApp();
    const userId = "550e8400-e29b-41d4-a716-446655440c00";
    const token = h.authService.signSession({ uid: userId, gid: "g_api29_ok" });
    h.bucketsRepo.bucketsByUser.set(userId, [
      makeBucket({ id: "b-1", userId, name: "Late drives" }),
    ]);
    h.bucketSongScoresRepo.setRows(userId, "b-1", [
      scoreRow({ userId, bucketId: "b-1", songKey: "s-a", score: 50 }),
      scoreRow({ userId, bucketId: "b-1", songKey: "s-b", score: 80 }),
    ]);
    const res = await request(h.app.getHttpServer())
      .get("/api/me/taste/buckets/b-1")
      .set("Cookie", `session=${token}`);
    expect(res.status).toBe(200);
    expect(() => BucketDetailResponse.parse(res.body)).not.toThrow();
    const parsed = BucketDetailResponse.parse(res.body);
    expect(parsed.bucket.id).toBe("b-1");
    expect(parsed.songs).toHaveLength(2);
  });

  it("songs is server-sorted by score desc (then lastUpdatedAt desc, then songKey asc)", async () => {
    h = await buildTasteTestApp();
    const userId = "550e8400-e29b-41d4-a716-446655440c01";
    const token = h.authService.signSession({ uid: userId, gid: "g_api29_sort" });
    h.bucketsRepo.bucketsByUser.set(userId, [makeBucket({ id: "b-1", userId })]);
    h.bucketSongScoresRepo.setRows(userId, "b-1", [
      scoreRow({
        userId,
        bucketId: "b-1",
        songKey: "z-tie-old",
        score: 90,
        lastUpdatedAt: new Date("2026-04-01T00:00:00.000Z"),
      }),
      scoreRow({
        userId,
        bucketId: "b-1",
        songKey: "z-tie-new",
        score: 90,
        lastUpdatedAt: new Date("2026-05-01T00:00:00.000Z"),
      }),
      scoreRow({
        userId,
        bucketId: "b-1",
        songKey: "a-tie-new",
        score: 90,
        lastUpdatedAt: new Date("2026-05-01T00:00:00.000Z"),
      }),
      scoreRow({ userId, bucketId: "b-1", songKey: "low", score: 10 }),
    ]);
    const res = await request(h.app.getHttpServer())
      .get("/api/me/taste/buckets/b-1")
      .set("Cookie", `session=${token}`);
    expect(res.status).toBe(200);
    const parsed = BucketDetailResponse.parse(res.body);
    expect(parsed.songs.map((s) => s.songKey)).toEqual([
      // score 90s first, newer lastUpdatedAt first within score-tie,
      // songKey ascending within the residual tie.
      "a-tie-new",
      "z-tie-new",
      "z-tie-old",
      "low",
    ]);
  });

  it("songs is [] when the bucket has no bucket_song_scores rows", async () => {
    h = await buildTasteTestApp();
    const userId = "550e8400-e29b-41d4-a716-446655440c02";
    const token = h.authService.signSession({ uid: userId, gid: "g_api29_empty" });
    h.bucketsRepo.bucketsByUser.set(userId, [
      makeBucket({ id: "b-empty", userId, state: "building" }),
    ]);
    // No score rows for the bucket.
    const res = await request(h.app.getHttpServer())
      .get("/api/me/taste/buckets/b-empty")
      .set("Cookie", `session=${token}`);
    expect(res.status).toBe(200);
    const parsed = BucketDetailResponse.parse(res.body);
    expect(parsed.songs).toEqual([]);
  });

  it("bucket field carries coverArtworkUrl: string | null (API-28 shape)", async () => {
    h = await buildTasteTestApp();
    const userId = "550e8400-e29b-41d4-a716-446655440c03";
    const token = h.authService.signSession({ uid: userId, gid: "g_api29_cover" });
    h.bucketsRepo.bucketsByUser.set(userId, [makeBucket({ id: "b-1", userId })]);
    h.bucketSongScoresRepo.setRows(userId, "b-1", [
      scoreRow({
        userId,
        bucketId: "b-1",
        songKey: "s-top",
        score: 90,
        coverUrl: "https://cdn/top.jpg",
      }),
    ]);
    const res = await request(h.app.getHttpServer())
      .get("/api/me/taste/buckets/b-1")
      .set("Cookie", `session=${token}`);
    expect(res.status).toBe(200);
    const parsed = BucketDetailResponse.parse(res.body);
    expect(parsed.bucket.coverArtworkUrl).toBe("https://cdn/top.jpg");
  });

  it("returns 404 + ErrorResponse when the bucketId does not exist", async () => {
    h = await buildTasteTestApp();
    const userId = "550e8400-e29b-41d4-a716-446655440c04";
    const token = h.authService.signSession({ uid: userId, gid: "g_api29_404" });
    // No buckets seeded for this user.
    const res = await request(h.app.getHttpServer())
      .get("/api/me/taste/buckets/b-missing")
      .set("Cookie", `session=${token}`);
    expect(res.status).toBe(404);
    expect(() => ErrorResponse.parse(res.body)).not.toThrow();
  });

  it("404 body is identical whether the bucket is absent OR owned by another user (no probing oracle)", async () => {
    h = await buildTasteTestApp();
    const userA = "550e8400-e29b-41d4-a716-446655440c10";
    const userB = "550e8400-e29b-41d4-a716-446655440c11";
    const tokenB = h.authService.signSession({ uid: userB, gid: "g_api29_oracle" });

    // Bucket exists, but it's user A's.
    h.bucketsRepo.bucketsByUser.set(userA, [makeBucket({ id: "b-owned-by-a", userId: userA })]);

    const resOwned = await request(h.app.getHttpServer())
      .get("/api/me/taste/buckets/b-owned-by-a")
      .set("Cookie", `session=${tokenB}`);
    const resAbsent = await request(h.app.getHttpServer())
      .get("/api/me/taste/buckets/b-truly-absent")
      .set("Cookie", `session=${tokenB}`);

    expect(resOwned.status).toBe(404);
    expect(resAbsent.status).toBe(404);
    // Identical bodies — no distinguishing field reveals "this exists for someone else".
    expect(resOwned.body).toEqual(resAbsent.body);
  });

  it("response body contains no Mongo internals (_id, __v)", async () => {
    h = await buildTasteTestApp();
    const userId = "550e8400-e29b-41d4-a716-446655440c05";
    const token = h.authService.signSession({ uid: userId, gid: "g_api29_internals" });
    h.bucketsRepo.bucketsByUser.set(userId, [makeBucket({ id: "b-1", userId })]);
    h.bucketSongScoresRepo.setRows(userId, "b-1", [
      scoreRow({ userId, bucketId: "b-1", songKey: "s-1", score: 50 }),
    ]);
    const res = await request(h.app.getHttpServer())
      .get("/api/me/taste/buckets/b-1")
      .set("Cookie", `session=${token}`);
    expect(res.status).toBe(200);
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toMatch(/"_id"\s*:/);
    expect(serialized).not.toMatch(/"__v"\s*:/);
    expect(Object.keys(res.body as object).sort()).toEqual(["bucket", "songs"]);
  });
});
