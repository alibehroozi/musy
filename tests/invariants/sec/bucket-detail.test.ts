// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under SEC-18.

import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import { ErrorResponse } from "@moc/contracts";
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
    lastUpdatedAt: new Date("2026-05-01T00:00:00.000Z"),
  } as unknown as BucketSongScoresDocument;
}

describe("SEC-18: GET /api/me/taste/buckets/:bucketId — owner-scoped, no IDOR", () => {
  let h: TasteTestAppHandle | undefined;
  afterEach(async () => {
    if (h) await h.app.close();
    h = undefined;
  });

  it("user A's bucket detail is never returned to user B (both reads filter by session userId)", async () => {
    h = await buildTasteTestApp();
    const userA = "550e8400-e29b-41d4-a716-446655440d00";
    const userB = "550e8400-e29b-41d4-a716-446655440d01";
    const tokenB = h.authService.signSession({ uid: userB, gid: "g_sec18_b" });

    // Seed user A's bucket + scores. User B has nothing.
    h.bucketsRepo.bucketsByUser.set(userA, [
      makeBucket({ id: "b-private", userId: userA, name: "A's secret" }),
    ]);
    h.bucketSongScoresRepo.setRows(userA, "b-private", [
      scoreRow({
        userId: userA,
        bucketId: "b-private",
        songKey: "s-secret",
        score: 99,
        coverUrl: "https://cdn/A.jpg",
      }),
    ]);

    const res = await request(h.app.getHttpServer())
      .get("/api/me/taste/buckets/b-private")
      .set("Cookie", `session=${tokenB}`);
    expect(res.status).toBe(404);
    expect(() => ErrorResponse.parse(res.body)).not.toThrow();
    // No A-owned identifiers leak into B's 404 body.
    expect(JSON.stringify(res.body)).not.toMatch(/A's secret/);
    expect(JSON.stringify(res.body)).not.toMatch(/s-secret/);
    expect(JSON.stringify(res.body)).not.toMatch(/cdn\/A\.jpg/);
  });

  it("findByIdForUser is always called with the SESSION userId — never a foreign value from the path", async () => {
    h = await buildTasteTestApp();
    const sessionUid = "550e8400-e29b-41d4-a716-446655440d10";
    const victimUid = "550e8400-e29b-41d4-a716-446655440d99";
    const token = h.authService.signSession({ uid: sessionUid, gid: "g_sec18_scope" });

    h.bucketsRepo.bucketsByUser.set(victimUid, [makeBucket({ id: "b-victim", userId: victimUid })]);

    await request(h.app.getHttpServer())
      .get("/api/me/taste/buckets/b-victim")
      .set("Cookie", `session=${token}`);

    // Repo was queried exactly with the session uid, never the victim's.
    expect(h.bucketsRepo.byIdCalls.length).toBeGreaterThan(0);
    expect(h.bucketsRepo.byIdCalls.every((c) => c.userId === sessionUid)).toBe(true);
    expect(h.bucketsRepo.byIdCalls.some((c) => c.userId === victimUid)).toBe(false);
  });

  it("no bucket_song_scores query is issued when the buckets lookup misses (404 short-circuits the join)", async () => {
    h = await buildTasteTestApp();
    const userId = "550e8400-e29b-41d4-a716-446655440d20";
    const token = h.authService.signSession({ uid: userId, gid: "g_sec18_short" });
    // No buckets seeded — the lookup must miss.

    const res = await request(h.app.getHttpServer())
      .get("/api/me/taste/buckets/b-missing")
      .set("Cookie", `session=${token}`);
    expect(res.status).toBe(404);

    // The fake score repo's call log stays empty — the service short-circuited.
    expect(h.bucketSongScoresRepo.readCalls).toEqual([]);
  });
});
