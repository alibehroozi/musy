// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under SEC-06.

import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import {
  buildInterestScoresTestApp,
  type InterestScoresTestAppHandle,
} from "../_helpers/interest-scores-test-app.js";

const VALID_BODY = {
  source: "audius",
  externalId: "track-sec06",
  snapshot: { title: "Test", artist: "Artist", kind: "track" },
};

describe("SEC-06: interest_scores documents are scoped per-user; no endpoint exposes another user's documents", () => {
  let h: InterestScoresTestAppHandle | undefined;
  afterEach(async () => {
    if (h) await h.app.close();
    h = undefined;
  });

  it("user A's explored event is stored under user A's userId", async () => {
    h = await buildInterestScoresTestApp();
    const userA = "550e8400-e29b-41d4-a716-44665544001a";
    const tokenA = h.authService.signSession({ uid: userA, gid: "g_user_a" });

    const res = await request(h.app.getHttpServer())
      .post("/api/search/explored")
      .send(VALID_BODY)
      .set("Content-Type", "application/json")
      .set("Cookie", `session=${tokenA}`);

    expect(res.status).toBe(204);
    expect(h.interestRepo.records).toHaveLength(1);
    expect(h.interestRepo.records[0]?.userId).toBe(userA);
  });

  it("user B's session cannot record an event on user A's behalf (each session scopes to its own userId)", async () => {
    h = await buildInterestScoresTestApp();
    const userA = "550e8400-e29b-41d4-a716-44665544001a";
    const userB = "550e8400-e29b-41d4-a716-44665544001b";
    const tokenA = h.authService.signSession({ uid: userA, gid: "g_user_a" });
    const tokenB = h.authService.signSession({ uid: userB, gid: "g_user_b" });

    await request(h.app.getHttpServer())
      .post("/api/search/explored")
      .send(VALID_BODY)
      .set("Content-Type", "application/json")
      .set("Cookie", `session=${tokenA}`);

    await request(h.app.getHttpServer())
      .post("/api/search/explored")
      .send(VALID_BODY)
      .set("Content-Type", "application/json")
      .set("Cookie", `session=${tokenB}`);

    const userARecords = h.interestRepo.records.filter((r) => r.userId === userA);
    const userBRecords = h.interestRepo.records.filter((r) => r.userId === userB);

    expect(userARecords).toHaveLength(1);
    expect(userBRecords).toHaveLength(1);
    // User B's records don't overlap with User A's
    expect(userBRecords[0]?.userId).not.toBe(userA);
  });
});
