// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under SEC-*.

import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import { buildTestApp, makeTestUser, type TestAppHandle } from "../_helpers/test-app.js";

function getCookieValue(setCookie: string | string[] | undefined, name: string): string | null {
  if (!setCookie) return null;
  const arr = Array.isArray(setCookie) ? setCookie : [setCookie];
  for (const c of arr) {
    const m = new RegExp(`^${name}=([^;]*)`).exec(c);
    if (m && typeof m[1] === "string") return m[1];
  }
  return null;
}

function encodeStateCookie(state: string, codeVerifier: string): string {
  return Buffer.from(JSON.stringify({ state, codeVerifier }), "utf8").toString("base64url");
}

describe("SEC-01: Session/state cookie values and signing/client secrets never appear in any response body or log line", () => {
  let h: TestAppHandle | undefined;
  afterEach(async () => {
    if (h) await h.app.close();
    h = undefined;
  });

  it("the session cookie value is not echoed in any response body", async () => {
    h = await buildTestApp();
    const server = h.app.getHttpServer();
    const user = makeTestUser();
    await h.fakeUsers.create(user);
    const sessionJwt = h.authService.signSession({ uid: user.id, gid: user.googleId });

    const responses = [
      await request(server).get("/api/auth/me").set("Cookie", `session=${sessionJwt}`),
      await request(server).get("/health"),
      await request(server).post("/api/auth/logout"),
      await request(server).get("/api/auth/me"),
    ];
    for (const res of responses) {
      const bodyText = typeof res.body === "string" ? res.body : JSON.stringify(res.body ?? "");
      expect(bodyText).not.toContain(sessionJwt);
    }
  });

  it("the oauth_state cookie value is not echoed in any response body", async () => {
    h = await buildTestApp();
    const server = h.app.getHttpServer();
    const start = await request(server).get("/api/auth/google");
    expect(start.status).toBe(302);
    const stateCookieRaw = getCookieValue(start.headers["set-cookie"], "oauth_state");
    expect(stateCookieRaw).not.toBeNull();

    const responses = [
      await request(server)
        .get("/api/auth/google/callback")
        .set("Cookie", `oauth_state=${stateCookieRaw}`),
      await request(server).get("/api/does-not-exist"),
      await request(server).get("/api/auth/me"),
    ];
    for (const res of responses) {
      const bodyText = typeof res.body === "string" ? res.body : JSON.stringify(res.body ?? "");
      expect(bodyText).not.toContain(stateCookieRaw!);
    }
  });

  it("SESSION_SECRET is never echoed in any response body", async () => {
    h = await buildTestApp();
    const server = h.app.getHttpServer();
    const responses = [
      await request(server).get("/api/auth/me"),
      await request(server).get("/api/does-not-exist"),
      await request(server).get("/api/auth/google/callback"),
      await request(server).get("/health"),
    ];
    for (const res of responses) {
      const bodyText = typeof res.body === "string" ? res.body : JSON.stringify(res.body ?? "");
      expect(bodyText).not.toContain(h.env.SESSION_SECRET);
    }
  });

  it("GOOGLE_CLIENT_SECRET is never echoed in any response body", async () => {
    h = await buildTestApp();
    const server = h.app.getHttpServer();
    const responses = [
      await request(server).get("/api/auth/me"),
      await request(server).get("/api/does-not-exist"),
      await request(server).get("/api/auth/google/callback"),
      await request(server).get("/api/auth/google"),
    ];
    for (const res of responses) {
      const bodyText = typeof res.body === "string" ? res.body : JSON.stringify(res.body ?? "");
      expect(bodyText).not.toContain(h.env.GOOGLE_CLIENT_SECRET);
    }
  });
});

describe("SEC-02: GET /api/auth/google/callback returns 4xx when state is missing or mismatched (CSRF)", () => {
  let h: TestAppHandle | undefined;
  afterEach(async () => {
    if (h) await h.app.close();
    h = undefined;
  });

  it("400 when state query param is missing", async () => {
    h = await buildTestApp();
    const res = await request(h.app.getHttpServer()).get("/api/auth/google/callback?code=abc");
    expect(res.status).toBe(400);
  });

  it("400 when oauth_state cookie is missing", async () => {
    h = await buildTestApp();
    const res = await request(h.app.getHttpServer()).get(
      "/api/auth/google/callback?code=abc&state=xyz",
    );
    expect(res.status).toBe(400);
  });

  it("400 when state query and oauth_state cookie do not match", async () => {
    h = await buildTestApp();
    const cookieValue = encodeStateCookie("a-different-state", "some-code-verifier");
    const res = await request(h.app.getHttpServer())
      .get("/api/auth/google/callback?code=abc&state=xyz")
      .set("Cookie", `oauth_state=${cookieValue}`);
    expect(res.status).toBe(400);
  });
});

describe("SEC-03: Routes outside the public allowlist return 401 without a valid session cookie", () => {
  let h: TestAppHandle | undefined;
  afterEach(async () => {
    if (h) await h.app.close();
    h = undefined;
  });

  it("GET /api/auth/me returns 401 without session", async () => {
    h = await buildTestApp();
    const res = await request(h.app.getHttpServer()).get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("GET /health is public and returns 200 without session", async () => {
    h = await buildTestApp();
    const res = await request(h.app.getHttpServer()).get("/health");
    expect(res.status).toBe(200);
  });

  it("GET /api/auth/google is public and redirects without session", async () => {
    h = await buildTestApp();
    const res = await request(h.app.getHttpServer()).get("/api/auth/google");
    expect(res.status).toBe(302);
    expect(typeof res.headers.location).toBe("string");
    expect(res.headers.location).toMatch(/^https:\/\/accounts\.google\.com\//);
  });

  it("GET /api/auth/google/callback is public (its own CSRF check, not the AuthGuard, gates it)", async () => {
    h = await buildTestApp();
    const res = await request(h.app.getHttpServer()).get("/api/auth/google/callback");
    expect(res.status).toBe(400);
    expect(res.status).not.toBe(401);
  });

  it("POST /api/auth/logout is public and returns 204 without session", async () => {
    h = await buildTestApp();
    const res = await request(h.app.getHttpServer()).post("/api/auth/logout");
    expect(res.status).toBe(204);
  });
});
