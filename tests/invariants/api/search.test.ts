// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under API-03, API-04.

import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import { ErrorResponse, SearchResponse } from "@moc/contracts";
import { buildSearchTestApp, type SearchTestAppHandle } from "../_helpers/search-test-app.js";

describe("API-03: POST /api/search is publicly accessible; returns 400 + ErrorResponse when q is empty or missing", () => {
  let h: SearchTestAppHandle | undefined;
  afterEach(async () => {
    if (h) await h.app.close();
    h = undefined;
  });

  it("returns non-401 without a session cookie", async () => {
    h = await buildSearchTestApp();
    const res = await request(h.app.getHttpServer())
      .post("/api/search")
      .send({ q: "test" })
      .set("Content-Type", "application/json");
    expect(res.status).not.toBe(401);
  });

  it("returns 400 + ErrorResponse when q is empty string", async () => {
    h = await buildSearchTestApp();
    const res = await request(h.app.getHttpServer())
      .post("/api/search")
      .send({ q: "" })
      .set("Content-Type", "application/json");
    expect(res.status).toBe(400);
    expect(() => ErrorResponse.parse(res.body)).not.toThrow();
  });

  it("returns 400 + ErrorResponse when q is missing from body", async () => {
    h = await buildSearchTestApp();
    const res = await request(h.app.getHttpServer())
      .post("/api/search")
      .send({})
      .set("Content-Type", "application/json");
    expect(res.status).toBe(400);
    expect(() => ErrorResponse.parse(res.body)).not.toThrow();
  });
});

describe("API-04: POST /api/search always returns 200 + SearchResponse, even when all providers fail", () => {
  let h: SearchTestAppHandle | undefined;
  afterEach(async () => {
    if (h) await h.app.close();
    h = undefined;
  });

  it("response body matches SearchResponse schema when providers return results", async () => {
    h = await buildSearchTestApp();
    const res = await request(h.app.getHttpServer())
      .post("/api/search")
      .send({ q: "daft punk" })
      .set("Content-Type", "application/json");
    expect(res.status).toBe(200);
    expect(() => SearchResponse.parse(res.body)).not.toThrow();
  });

  it("returns 200 with results: [], partial: true when all providers fail", async () => {
    h = await buildSearchTestApp();
    h.audius.shouldFail = true;
    h.deezer.shouldFail = true;
    h.radioBrowser.shouldFail = true;
    h.genius.shouldFail = true;

    const res = await request(h.app.getHttpServer())
      .post("/api/search")
      .send({ q: "daft punk" })
      .set("Content-Type", "application/json");
    expect(res.status).toBe(200);
    const body = SearchResponse.parse(res.body);
    expect(body.results).toHaveLength(0);
    expect(body.partial).toBe(true);
    expect(body.failedProviders).toHaveLength(4);
  });

  it("response includes cached: false on first request, cached: true on cache hit", async () => {
    h = await buildSearchTestApp();

    const res1 = await request(h.app.getHttpServer())
      .post("/api/search")
      .send({ q: "daft punk" })
      .set("Content-Type", "application/json");
    expect(res1.status).toBe(200);
    expect(SearchResponse.parse(res1.body).cached).toBe(false);

    // Simulate a cache hit for the second request
    h.repo.cachedResult = { results: [], failedProviders: [] };

    const res2 = await request(h.app.getHttpServer())
      .post("/api/search")
      .send({ q: "daft punk" })
      .set("Content-Type", "application/json");
    expect(res2.status).toBe(200);
    expect(SearchResponse.parse(res2.body).cached).toBe(true);
  });
});
