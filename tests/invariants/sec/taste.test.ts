// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under SEC-12.

import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import {
  buildTasteTestApp,
  makeBucket,
  type TasteTestAppHandle,
} from "../_helpers/taste-test-app.js";

describe("SEC-12: GET /api/me/taste/profile scopes every read to the authenticated session's userId", () => {
  let h: TasteTestAppHandle | undefined;
  afterEach(async () => {
    if (h) await h.app.close();
    h = undefined;
  });

  it("user A's buckets are never returned to user B", async () => {
    h = await buildTasteTestApp();
    const userA = "550e8400-e29b-41d4-a716-446655440b00";
    const userB = "550e8400-e29b-41d4-a716-446655440b01";
    const tokenA = h.authService.signSession({ uid: userA, gid: "g_taste_a" });
    const tokenB = h.authService.signSession({ uid: userB, gid: "g_taste_b" });
    h.bucketsRepo.bucketsByUser.set(userA, [
      makeBucket({ id: "b-a-1", userId: userA, name: "A's private mix" }),
    ]);
    // B has no buckets — but a malformed read could leak A's.
    const resA = await request(h.app.getHttpServer())
      .get("/api/me/taste/profile")
      .set("Cookie", `session=${tokenA}`);
    expect(resA.status).toBe(200);
    expect((resA.body as { buckets: { id: string }[] }).buckets.map((b) => b.id)).toEqual([
      "b-a-1",
    ]);

    const resB = await request(h.app.getHttpServer())
      .get("/api/me/taste/profile")
      .set("Cookie", `session=${tokenB}`);
    expect(resB.status).toBe(200);
    expect((resB.body as { buckets: unknown[] }).buckets).toEqual([]);
    // No leakage of A's bucket through any path.
    expect(JSON.stringify(resB.body)).not.toMatch(/A's private mix/);
  });

  it("the buckets repository read filter always includes the authenticated userId", async () => {
    h = await buildTasteTestApp();
    const sessionUid = "550e8400-e29b-41d4-a716-446655440b10";
    const victimId = "550e8400-e29b-41d4-a716-446655440b99";
    const token = h.authService.signSession({ uid: sessionUid, gid: "g_taste_smuggle" });
    h.bucketsRepo.bucketsByUser.set(victimId, [
      makeBucket({ id: "b-victim", userId: victimId, name: "Victim's bucket" }),
    ]);
    // Even if a smuggled userId in query / body were tried, the controller
    // pulls userId only from the session — the fake repo records every
    // userId it sees so we can assert.
    await request(h.app.getHttpServer())
      .get(`/api/me/taste/profile?userId=${victimId}`)
      .set("Cookie", `session=${token}`)
      .send({ userId: victimId });
    expect(h.bucketsRepo.readUserIds).toEqual([sessionUid]);
  });
});
