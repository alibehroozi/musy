// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under SEC-16.

import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import { CustomMixCreatedResponse, TasteBucketsResponse } from "@moc/contracts";

import {
  buildCustomMixTestApp,
  seedRightSwipes,
  type CustomMixTestAppHandle,
} from "../_helpers/custom-mix-test-app.js";

describe("SEC-16: POST /api/me/taste/custom-mix scopes userId to the authenticated session", () => {
  let h: CustomMixTestAppHandle | undefined;
  afterEach(async () => {
    if (h) await h.app.close();
    h = undefined;
  });

  it("buckets row created carries userId === session.user.uid, ignoring any body-supplied userId", async () => {
    h = await buildCustomMixTestApp();
    const realUser = "550e8400-e29b-41d4-a716-446655440d00";
    const otherUser = "550e8400-e29b-41d4-a716-446655440dff";
    const token = h.authService.signSession({ uid: realUser, gid: "g_cm_sec_1" });
    seedRightSwipes(h.swipes, realUser, 3);

    // Hang Anthropic so we observe the pre-insert state.
    h.anthropic.complete = () => new Promise(() => {});

    const res = await request(h.app.getHttpServer())
      .post("/api/me/taste/custom-mix")
      .set("Cookie", `session=${token}`)
      // Body-supplied userId must be ignored — the spec says any
      // `userId`-shaped field is dropped by the controller.
      .send({ promptText: "moody", userId: otherUser });

    expect(res.status).toBe(200);
    expect(h.buckets.rows).toHaveLength(1);
    expect(h.buckets.rows[0]!.userId).toBe(realUser);
    expect(h.buckets.rows.find((r) => r.userId === otherUser)).toBeUndefined();
  });

  it("custom_mix_jobs row created carries the session's userId, not any body-supplied value", async () => {
    h = await buildCustomMixTestApp();
    const realUser = "550e8400-e29b-41d4-a716-446655440d01";
    const otherUser = "550e8400-e29b-41d4-a716-446655440dfe";
    const token = h.authService.signSession({ uid: realUser, gid: "g_cm_sec_2" });
    seedRightSwipes(h.swipes, realUser, 3);
    h.anthropic.complete = () => new Promise(() => {});

    const res = await request(h.app.getHttpServer())
      .post("/api/me/taste/custom-mix")
      .set("Cookie", `session=${token}`)
      .send({ promptText: "moody", userId: otherUser });

    expect(res.status).toBe(200);
    expect(h.jobs.rows).toHaveLength(1);
    expect(h.jobs.rows[0]!.userId).toBe(realUser);
  });

  it("user A's mix is never returned to user B via GET /me/taste/profile", async () => {
    h = await buildCustomMixTestApp();
    const userA = "550e8400-e29b-41d4-a716-446655440d02";
    const userB = "550e8400-e29b-41d4-a716-446655440d03";
    const tokenA = h.authService.signSession({ uid: userA, gid: "g_cm_sec_A" });
    const tokenB = h.authService.signSession({ uid: userB, gid: "g_cm_sec_B" });
    seedRightSwipes(h.swipes, userA, 3);
    h.anthropic.complete = () => new Promise(() => {});

    const create = await request(h.app.getHttpServer())
      .post("/api/me/taste/custom-mix")
      .set("Cookie", `session=${tokenA}`)
      .send({ promptText: "A's prompt" });
    expect(create.status).toBe(200);
    const { bucketId } = CustomMixCreatedResponse.parse(create.body);

    // User A sees their bucket.
    const getA = await request(h.app.getHttpServer())
      .get("/api/me/taste/profile")
      .set("Cookie", `session=${tokenA}`);
    const profileA = TasteBucketsResponse.parse(getA.body);
    expect(profileA.buckets.map((b) => b.id)).toContain(bucketId);

    // User B sees an empty list — A's bucket is invisible.
    const getB = await request(h.app.getHttpServer())
      .get("/api/me/taste/profile")
      .set("Cookie", `session=${tokenB}`);
    const profileB = TasteBucketsResponse.parse(getB.body);
    expect(profileB.buckets).toHaveLength(0);
    expect(profileB.buckets.find((b) => b.id === bucketId)).toBeUndefined();
  });
});
