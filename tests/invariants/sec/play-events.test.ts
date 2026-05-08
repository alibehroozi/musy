// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under SEC-07.

import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import { buildPlayTestApp, type PlayTestAppHandle } from "../_helpers/play-test-app.js";

const USER_A_ID = "550e8400-e29b-41d4-a716-446655440001";
const USER_A_GID = "g_user_a_117851234567890123456";
const VALID_SNAPSHOT = { title: "Get Lucky", artist: "Daft Punk", kind: "track", durationSec: 249 };

describe("SEC-07: User A's session cannot write to user B's interest_scores or listening_events by body field manipulation", () => {
  let h: PlayTestAppHandle | undefined;
  afterEach(async () => {
    if (h) await h.app.close();
    h = undefined;
  });

  it("a userId field in the POST /play/started body is ignored; record uses session userId", async () => {
    h = await buildPlayTestApp();
    const sessionUserId = USER_A_ID;
    const token = h.authService.signSession({ uid: sessionUserId, gid: USER_A_GID });
    await request(h.app.getHttpServer())
      .post("/api/play/started")
      .send({
        source: "audius",
        externalId: "track-x",
        snapshot: VALID_SNAPSHOT,
        userId: "injected-user-id",
      })
      .set("Content-Type", "application/json")
      .set("Cookie", `session=${token}`);

    expect(h.listeningEvents.inserted[0]?.userId).toBe(sessionUserId);
    expect(h.interestScores.upserted[0]?.userId).toBe(sessionUserId);
  });

  it("a userId field in the POST /play/completed body is ignored; record uses session userId", async () => {
    h = await buildPlayTestApp();
    const sessionUserId = USER_A_ID;
    const token = h.authService.signSession({ uid: sessionUserId, gid: USER_A_GID });
    await request(h.app.getHttpServer())
      .post("/api/play/completed")
      .send({
        source: "audius",
        externalId: "track-x",
        snapshot: VALID_SNAPSHOT,
        elapsedMs: 1000,
        userId: "injected-user-id",
      })
      .set("Content-Type", "application/json")
      .set("Cookie", `session=${token}`);

    expect(h.listeningEvents.inserted[0]?.userId).toBe(sessionUserId);
    expect(h.interestScores.upserted[0]?.userId).toBe(sessionUserId);
  });

  it("user A cannot overwrite user B's interest_scores by supplying user B's songKey + user A's session", async () => {
    h = await buildPlayTestApp();
    const userAId = USER_A_ID;
    const tokenA = h.authService.signSession({ uid: userAId, gid: USER_A_GID });

    await request(h.app.getHttpServer())
      .post("/api/play/started")
      .send({ source: "audius", externalId: "shared-track", snapshot: VALID_SNAPSHOT })
      .set("Content-Type", "application/json")
      .set("Cookie", `session=${tokenA}`);

    const record = h.interestScores.upserted[0];
    expect(record?.userId).toBe(userAId);
  });
});
