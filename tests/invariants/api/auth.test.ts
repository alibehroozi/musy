// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under API-*.

import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import { ErrorResponse, User } from "@moc/contracts";
import { buildTestApp, makeTestUser, type TestAppHandle } from "../_helpers/test-app.js";

describe("API-01: Every error response from apps/api matches the shared ErrorResponse Zod schema", () => {
  let h: TestAppHandle | undefined;
  afterEach(async () => {
    if (h) await h.app.close();
    h = undefined;
  });

  it("404 from an unknown route parses as ErrorResponse", async () => {
    h = await buildTestApp();
    const res = await request(h.app.getHttpServer()).get("/api/does-not-exist");
    expect(res.status).toBe(404);
    expect(() => ErrorResponse.parse(res.body)).not.toThrow();
  });

  it("401 from a protected route parses as ErrorResponse", async () => {
    h = await buildTestApp();
    const res = await request(h.app.getHttpServer()).get("/api/auth/me");
    expect(res.status).toBe(401);
    expect(() => ErrorResponse.parse(res.body)).not.toThrow();
  });

  it("400 from a malformed callback parses as ErrorResponse", async () => {
    h = await buildTestApp();
    const res = await request(h.app.getHttpServer()).get("/api/auth/google/callback");
    expect(res.status).toBe(400);
    expect(() => ErrorResponse.parse(res.body)).not.toThrow();
  });
});

describe("API-02: GET /api/auth/me returns 401 + ErrorResponse without a session, 200 + User with one", () => {
  let h: TestAppHandle | undefined;
  afterEach(async () => {
    if (h) await h.app.close();
    h = undefined;
  });

  it("401 + ErrorResponse when no session cookie is present", async () => {
    h = await buildTestApp();
    const res = await request(h.app.getHttpServer()).get("/api/auth/me");
    expect(res.status).toBe(401);
    expect(() => ErrorResponse.parse(res.body)).not.toThrow();
  });

  it("401 + ErrorResponse when the session cookie is malformed/forged", async () => {
    h = await buildTestApp();
    const res = await request(h.app.getHttpServer())
      .get("/api/auth/me")
      .set("Cookie", "session=not-a-valid-jwt");
    expect(res.status).toBe(401);
    expect(() => ErrorResponse.parse(res.body)).not.toThrow();
  });

  it("200 + body matching the User Zod schema when the session cookie is valid", async () => {
    h = await buildTestApp();
    const user = makeTestUser();
    await h.fakeUsers.create(user);
    const sessionJwt = h.authService.signSession({ uid: user.id, gid: user.googleId });

    const res = await request(h.app.getHttpServer())
      .get("/api/auth/me")
      .set("Cookie", `session=${sessionJwt}`);

    expect(res.status).toBe(200);
    expect(() => User.parse(res.body)).not.toThrow();
    expect(res.body.id).toBe(user.id);
  });
});
