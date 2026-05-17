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
  // Filled in by the feat(api) commit that lands the read-time join in
  // taste.service.ts; the test home is here so the spec ID grep already
  // resolves.
  it.todo("every bucket carries coverArtworkUrl: string | null (Zod contract holds)");
  it.todo("coverArtworkUrl is the snapshot.artworkUrl of the highest-score bucket_song_scores row");
  it.todo("ties on score are broken by lexicographically smallest songKey");
  it.todo("coverArtworkUrl is null when the top-scored row has snapshot.artworkUrl == null");
  it.todo(
    "coverArtworkUrl is null when no bucket_song_scores row exists for the bucket (e.g. state: building)",
  );
  it.todo("coverArtworkUrl is null when the top-scored row's artworkUrl fails URL parsing");
  it.todo(
    "SEC-12 holds: artwork URL join is scoped by session userId — user A never leaks into user B",
  );
});
