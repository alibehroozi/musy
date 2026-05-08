// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under API-07.

import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import { ErrorResponse } from "@moc/contracts";
import {
  buildInterestScoresTestApp,
  type InterestScoresTestAppHandle,
} from "../_helpers/interest-scores-test-app.js";

const VALID_BODY = {
  source: "audius",
  externalId: "track-001",
  snapshot: {
    title: "Test Track",
    artist: "Test Artist",
    kind: "track",
  },
};

describe("API-07: POST /api/search/explored and POST /api/search/saved require a valid session; return 401 without session", () => {
  let h: InterestScoresTestAppHandle | undefined;
  afterEach(async () => {
    if (h) await h.app.close();
    h = undefined;
  });

  it("POST /api/search/explored returns 401 + ErrorResponse when no session cookie is present", async () => {
    h = await buildInterestScoresTestApp();
    const res = await request(h.app.getHttpServer())
      .post("/api/search/explored")
      .send(VALID_BODY)
      .set("Content-Type", "application/json");
    expect(res.status).toBe(401);
    expect(() => ErrorResponse.parse(res.body)).not.toThrow();
  });

  it("POST /api/search/saved returns 401 + ErrorResponse when no session cookie is present", async () => {
    h = await buildInterestScoresTestApp();
    const res = await request(h.app.getHttpServer())
      .post("/api/search/saved")
      .send(VALID_BODY)
      .set("Content-Type", "application/json");
    expect(res.status).toBe(401);
    expect(() => ErrorResponse.parse(res.body)).not.toThrow();
  });

  it("POST /api/search/explored returns 204 when a valid session cookie is present", async () => {
    h = await buildInterestScoresTestApp();
    const token = h.authService.signSession({
      uid: "550e8400-e29b-41d4-a716-446655440010",
      gid: "g_user_api7",
    });
    const res = await request(h.app.getHttpServer())
      .post("/api/search/explored")
      .send(VALID_BODY)
      .set("Content-Type", "application/json")
      .set("Cookie", `session=${token}`);
    expect(res.status).toBe(204);
  });

  it("POST /api/search/saved returns 204 when a valid session cookie is present", async () => {
    h = await buildInterestScoresTestApp();
    const token = h.authService.signSession({
      uid: "550e8400-e29b-41d4-a716-446655440011",
      gid: "g_user_api7b",
    });
    const res = await request(h.app.getHttpServer())
      .post("/api/search/saved")
      .send(VALID_BODY)
      .set("Content-Type", "application/json")
      .set("Cookie", `session=${token}`);
    expect(res.status).toBe(204);
  });
});
