// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under API-09, API-10.

import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import { ErrorResponse } from "@moc/contracts";
import { buildPlayTestApp, type PlayTestAppHandle } from "../_helpers/play-test-app.js";

const TEST_USER_ID = "550e8400-e29b-41d4-a716-446655440000";
const TEST_GOOGLE_ID = "g_test_117851234567890123456";
const VALID_SNAPSHOT = { title: "Get Lucky", artist: "Daft Punk", kind: "track", durationSec: 249 };
const VALID_STARTED_BODY = { source: "audius", externalId: "abc123", snapshot: VALID_SNAPSHOT };
const VALID_COMPLETED_BODY = {
  source: "audius",
  externalId: "abc123",
  snapshot: VALID_SNAPSHOT,
  elapsedMs: 249000,
};

describe("API-09: POST /play/started and POST /play/completed require a valid session cookie; return 401 + ErrorResponse when missing; return 204 on success", () => {
  let h: PlayTestAppHandle | undefined;
  afterEach(async () => {
    if (h) await h.app.close();
    h = undefined;
  });

  it("POST /play/started returns 401 + ErrorResponse with no session cookie", async () => {
    h = await buildPlayTestApp();
    const res = await request(h.app.getHttpServer())
      .post("/api/play/started")
      .send(VALID_STARTED_BODY)
      .set("Content-Type", "application/json");
    expect(res.status).toBe(401);
    expect(() => ErrorResponse.parse(res.body)).not.toThrow();
  });

  it("POST /play/completed returns 401 + ErrorResponse with no session cookie", async () => {
    h = await buildPlayTestApp();
    const res = await request(h.app.getHttpServer())
      .post("/api/play/completed")
      .send(VALID_COMPLETED_BODY)
      .set("Content-Type", "application/json");
    expect(res.status).toBe(401);
    expect(() => ErrorResponse.parse(res.body)).not.toThrow();
  });

  it("POST /play/started returns 401 + ErrorResponse with an invalid session cookie", async () => {
    h = await buildPlayTestApp();
    const res = await request(h.app.getHttpServer())
      .post("/api/play/started")
      .send(VALID_STARTED_BODY)
      .set("Content-Type", "application/json")
      .set("Cookie", "session=not-a-valid-jwt");
    expect(res.status).toBe(401);
    expect(() => ErrorResponse.parse(res.body)).not.toThrow();
  });

  it("POST /play/started returns 204 with no body when authenticated and body is valid", async () => {
    h = await buildPlayTestApp();
    const token = h.authService.signSession({ uid: TEST_USER_ID, gid: TEST_GOOGLE_ID });
    const res = await request(h.app.getHttpServer())
      .post("/api/play/started")
      .send(VALID_STARTED_BODY)
      .set("Content-Type", "application/json")
      .set("Cookie", `session=${token}`);
    expect(res.status).toBe(204);
    expect(res.body).toEqual({});
  });

  it("POST /play/completed returns 204 with no body when authenticated and body is valid", async () => {
    h = await buildPlayTestApp();
    const token = h.authService.signSession({ uid: TEST_USER_ID, gid: TEST_GOOGLE_ID });
    const res = await request(h.app.getHttpServer())
      .post("/api/play/completed")
      .send(VALID_COMPLETED_BODY)
      .set("Content-Type", "application/json")
      .set("Cookie", `session=${token}`);
    expect(res.status).toBe(204);
    expect(res.body).toEqual({});
  });
});

describe("API-10: Both endpoints validate body against Zod schemas; reject malformed bodies with 400 + ErrorResponse; server ignores userId in body", () => {
  let h: PlayTestAppHandle | undefined;
  afterEach(async () => {
    if (h) await h.app.close();
    h = undefined;
  });

  it("POST /play/started returns 400 + ErrorResponse when source is missing", async () => {
    h = await buildPlayTestApp();
    const token = h.authService.signSession({ uid: TEST_USER_ID, gid: TEST_GOOGLE_ID });
    const res = await request(h.app.getHttpServer())
      .post("/api/play/started")
      .send({ externalId: "abc123", snapshot: VALID_SNAPSHOT })
      .set("Content-Type", "application/json")
      .set("Cookie", `session=${token}`);
    expect(res.status).toBe(400);
    expect(() => ErrorResponse.parse(res.body)).not.toThrow();
  });

  it("POST /play/started returns 400 + ErrorResponse when externalId is missing", async () => {
    h = await buildPlayTestApp();
    const token = h.authService.signSession({ uid: TEST_USER_ID, gid: TEST_GOOGLE_ID });
    const res = await request(h.app.getHttpServer())
      .post("/api/play/started")
      .send({ source: "audius", snapshot: VALID_SNAPSHOT })
      .set("Content-Type", "application/json")
      .set("Cookie", `session=${token}`);
    expect(res.status).toBe(400);
    expect(() => ErrorResponse.parse(res.body)).not.toThrow();
  });

  it("POST /play/started returns 400 + ErrorResponse when snapshot is malformed", async () => {
    h = await buildPlayTestApp();
    const token = h.authService.signSession({ uid: TEST_USER_ID, gid: TEST_GOOGLE_ID });
    const res = await request(h.app.getHttpServer())
      .post("/api/play/started")
      .send({ source: "audius", externalId: "abc123", snapshot: { title: "only title" } })
      .set("Content-Type", "application/json")
      .set("Cookie", `session=${token}`);
    expect(res.status).toBe(400);
    expect(() => ErrorResponse.parse(res.body)).not.toThrow();
  });

  it("POST /play/completed returns 400 + ErrorResponse when elapsedMs is negative", async () => {
    h = await buildPlayTestApp();
    const token = h.authService.signSession({ uid: TEST_USER_ID, gid: TEST_GOOGLE_ID });
    const res = await request(h.app.getHttpServer())
      .post("/api/play/completed")
      .send({ ...VALID_COMPLETED_BODY, elapsedMs: -1 })
      .set("Content-Type", "application/json")
      .set("Cookie", `session=${token}`);
    expect(res.status).toBe(400);
    expect(() => ErrorResponse.parse(res.body)).not.toThrow();
  });

  it("POST /play/completed returns 400 + ErrorResponse when elapsedMs is missing", async () => {
    h = await buildPlayTestApp();
    const token = h.authService.signSession({ uid: TEST_USER_ID, gid: TEST_GOOGLE_ID });
    const res = await request(h.app.getHttpServer())
      .post("/api/play/completed")
      .send({ source: "audius", externalId: "abc123", snapshot: VALID_SNAPSHOT })
      .set("Content-Type", "application/json")
      .set("Cookie", `session=${token}`);
    expect(res.status).toBe(400);
    expect(() => ErrorResponse.parse(res.body)).not.toThrow();
  });

  it("a userId field in the request body is ignored — the record uses the session userId, not the body userId", async () => {
    h = await buildPlayTestApp();
    const sessionUserId = TEST_USER_ID;
    const token = h.authService.signSession({ uid: sessionUserId, gid: TEST_GOOGLE_ID });
    const res = await request(h.app.getHttpServer())
      .post("/api/play/started")
      .send({ ...VALID_STARTED_BODY, userId: "attacker-user-id" })
      .set("Content-Type", "application/json")
      .set("Cookie", `session=${token}`);
    expect(res.status).toBe(204);
    const record = h.listeningEvents.inserted[0];
    expect(record?.userId).toBe(sessionUserId);
    expect(record?.userId).not.toBe("attacker-user-id");
  });
});
