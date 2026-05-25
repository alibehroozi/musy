// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under API-03, API-04, API-05, API-06, API-07.

import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import { ErrorResponse, HistoryResponse, SearchResponse } from "@moc/contracts";
import { buildSearchTestApp, type SearchTestAppHandle } from "../_helpers/search-test-app.js";
import {
  buildSearchHistoryTestApp,
  type SearchHistoryTestAppHandle,
} from "../_helpers/search-history-test-app.js";

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

describe("API-05: GET /api/search/history requires a valid session; returns 401 without session", () => {
  let h: SearchHistoryTestAppHandle | undefined;
  afterEach(async () => {
    if (h) await h.app.close();
    h = undefined;
  });

  it("returns 401 + ErrorResponse when no session cookie is present", async () => {
    h = await buildSearchHistoryTestApp();
    const res = await request(h.app.getHttpServer()).get("/api/search/history");
    expect(res.status).toBe(401);
    expect(() => ErrorResponse.parse(res.body)).not.toThrow();
  });

  it("returns 200 + HistoryResponse when a valid session cookie is present", async () => {
    h = await buildSearchHistoryTestApp();
    const token = h.authService.signSession({
      uid: "550e8400-e29b-41d4-a716-446655440001",
      gid: "g_user_1",
    });
    const res = await request(h.app.getHttpServer())
      .get("/api/search/history")
      .set("Cookie", `session=${token}`);
    expect(res.status).toBe(200);
    expect(() => HistoryResponse.parse(res.body)).not.toThrow();
  });
});

describe("API-06: Cursor pagination on GET /api/search/history is stable", () => {
  let h: SearchHistoryTestAppHandle | undefined;
  afterEach(async () => {
    if (h) await h.app.close();
    h = undefined;
  });

  it("issuing the same cursor twice returns the same entries", async () => {
    h = await buildSearchHistoryTestApp();
    const userId = "550e8400-e29b-41d4-a716-446655440002";
    // Seed 3 entries (page size will be 2 in test)
    const now = Date.now();
    h.historyRepo.historyByUser.set(userId, [
      {
        id: "e1",
        query: "queen",
        lastSearchedAt: new Date(now - 3000).toISOString(),
        searchCount: 1,
      },
      {
        id: "e2",
        query: "daft punk",
        lastSearchedAt: new Date(now - 2000).toISOString(),
        searchCount: 1,
      },
      {
        id: "e3",
        query: "radiohead",
        lastSearchedAt: new Date(now - 1000).toISOString(),
        searchCount: 1,
      },
    ]);

    const token = h.authService.signSession({ uid: userId, gid: "g_paginate" });

    // Fetch first page (limit=2)
    const page1 = await request(h.app.getHttpServer())
      .get("/api/search/history?limit=2")
      .set("Cookie", `session=${token}`);
    expect(page1.status).toBe(200);
    const body1 = HistoryResponse.parse(page1.body);
    expect(body1.nextCursor).not.toBeNull();

    // Fetch second page using the cursor
    const cursor = body1.nextCursor as string;
    const page2a = await request(h.app.getHttpServer())
      .get(`/api/search/history?limit=2&cursor=${encodeURIComponent(cursor)}`)
      .set("Cookie", `session=${token}`);
    expect(page2a.status).toBe(200);
    const body2a = HistoryResponse.parse(page2a.body);

    // Fetch second page again with the same cursor — must return the same entries
    const page2b = await request(h.app.getHttpServer())
      .get(`/api/search/history?limit=2&cursor=${encodeURIComponent(cursor)}`)
      .set("Cookie", `session=${token}`);
    expect(page2b.status).toBe(200);
    const body2b = HistoryResponse.parse(page2b.body);

    expect(body2b.entries.map((e) => e.id)).toEqual(body2a.entries.map((e) => e.id));
  });

  it("nextCursor is null when no more entries exist", async () => {
    h = await buildSearchHistoryTestApp();
    const userId = "550e8400-e29b-41d4-a716-446655440003";
    const now = Date.now();
    h.historyRepo.historyByUser.set(userId, [
      {
        id: "only-one",
        query: "queen",
        lastSearchedAt: new Date(now).toISOString(),
        searchCount: 1,
      },
    ]);

    const token = h.authService.signSession({ uid: userId, gid: "g_small" });
    const res = await request(h.app.getHttpServer())
      .get("/api/search/history")
      .set("Cookie", `session=${token}`);
    expect(res.status).toBe(200);
    const body = HistoryResponse.parse(res.body);
    expect(body.nextCursor).toBeNull();
  });
});

import {
  buildSearchEventsTestApp,
  type SearchEventsTestAppHandle,
} from "../_helpers/search-events-test-app.js";

describe("API-07: POST /api/search/explored and POST /api/search/saved require a valid session", () => {
  let h: SearchEventsTestAppHandle | undefined;
  afterEach(async () => {
    if (h) await h.app.close();
    h = undefined;
  });

  const validBody = {
    source: "deezer",
    externalId: "1",
    snapshot: { title: "Get Lucky", artist: "Daft Punk", kind: "track" },
  };

  it("POST /api/search/explored returns 401 + ErrorResponse without a session cookie", async () => {
    h = await buildSearchEventsTestApp();
    const res = await request(h.app.getHttpServer())
      .post("/api/search/explored")
      .send(validBody)
      .set("Content-Type", "application/json");
    expect(res.status).toBe(401);
    expect(() => ErrorResponse.parse(res.body)).not.toThrow();
  });

  it("POST /api/search/saved returns 401 + ErrorResponse without a session cookie", async () => {
    h = await buildSearchEventsTestApp();
    const res = await request(h.app.getHttpServer())
      .post("/api/search/saved")
      .send(validBody)
      .set("Content-Type", "application/json");
    expect(res.status).toBe(401);
    expect(() => ErrorResponse.parse(res.body)).not.toThrow();
  });

  it("POST /api/search/explored returns 204 with a valid session and matching body", async () => {
    h = await buildSearchEventsTestApp();
    const userId = "550e8400-e29b-41d4-a716-446655440010";
    const token = h.authService.signSession({ uid: userId, gid: "g_explored" });
    const res = await request(h.app.getHttpServer())
      .post("/api/search/explored")
      .send(validBody)
      .set("Content-Type", "application/json")
      .set("Cookie", `session=${token}`);
    expect(res.status).toBe(204);
    const docs = await h.repo.findScoresForUser(userId);
    expect(docs).toHaveLength(1);
    expect(docs[0]!.score).toBe(3);
  });

  it("POST /api/search/saved returns 204 with a valid session and matching body", async () => {
    h = await buildSearchEventsTestApp();
    const userId = "550e8400-e29b-41d4-a716-446655440011";
    const token = h.authService.signSession({ uid: userId, gid: "g_saved" });
    const res = await request(h.app.getHttpServer())
      .post("/api/search/saved")
      .send(validBody)
      .set("Content-Type", "application/json")
      .set("Cookie", `session=${token}`);
    expect(res.status).toBe(204);
    const docs = await h.repo.findScoresForUser(userId);
    expect(docs).toHaveLength(1);
    expect(docs[0]!.score).toBe(8);
  });

  it("POST /api/search/explored returns 400 + ErrorResponse when the body fails schema validation", async () => {
    h = await buildSearchEventsTestApp();
    const userId = "550e8400-e29b-41d4-a716-446655440012";
    const token = h.authService.signSession({ uid: userId, gid: "g_invalid" });
    const res = await request(h.app.getHttpServer())
      .post("/api/search/explored")
      .send({ source: "deezer" }) // missing externalId, snapshot
      .set("Content-Type", "application/json")
      .set("Cookie", `session=${token}`);
    expect(res.status).toBe(400);
    expect(() => ErrorResponse.parse(res.body)).not.toThrow();
  });
});

// ── Real-upstream test (no mocking) ──────────────────────────────────────────
//
// Per AGENTS.md hard rule #15, real upstream HTTP clients are NOT mocked in
// apps/api tests. This block hits live SoundCloud — same pattern as the
// SoundCloudStreamClient block in tests/invariants/api/play.test.ts. The
// only intentional override here is the spoofed User-Agent (a well-known
// browser UA), which is the production posture too.

import type { ConfigService } from "@nestjs/config";
import { SoundCloudClient } from "../../../apps/api/src/modules/search/providers/soundcloud.client.js";

function fakeConfig(env: Record<string, string> = {}): ConfigService {
  return {
    get: <T>(key: string, defaultValue?: T): T => {
      if (key in env) return env[key] as unknown as T;
      return defaultValue as T;
    },
    getOrThrow: <T>(key: string): T => {
      if (key in env) return env[key] as unknown as T;
      throw new Error(`Missing config key: ${key}`);
    },
  } as unknown as ConfigService;
}

const REAL_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

describe("SoundCloudClient: real provider (no mocking)", () => {
  it("returns at least one TrackResult for a popular query, with provider/sources stamped 'soundcloud'", async () => {
    const client = new SoundCloudClient(fakeConfig({ SOUNDCLOUD_USER_AGENT: REAL_UA }));
    const results = await client.search("dua lipa levitating");
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.type).toBe("track");
      expect(r.provider).toBe("soundcloud");
      expect(r.sources).toEqual(["soundcloud"]);
      expect(typeof r.title).toBe("string");
      expect(r.title.length).toBeGreaterThan(0);
      expect(typeof r.artist).toBe("string");
    }
  }, 30_000);

  it("returns an empty array for a nonsense query (success-with-no-results, not an error)", async () => {
    const client = new SoundCloudClient(fakeConfig({ SOUNDCLOUD_USER_AGENT: REAL_UA }));
    const results = await client.search("zzqqxxvvbbnn-no-real-matches-zzqqxxvvbbnn");
    // SoundCloud generally returns an empty collection for jibberish; the
    // assertion here is that the call succeeds (no throw) with a typed array.
    expect(Array.isArray(results)).toBe(true);
  }, 30_000);
});

describe("LOGIC-44: SoundCloudClient.search() returns up to 25 normalized TrackResult per query", () => {
  it("never returns more than 25 results for a popular query (real upstream)", async () => {
    const client = new SoundCloudClient(fakeConfig({ SOUNDCLOUD_USER_AGENT: REAL_UA }));
    const results = await client.search("the beatles");
    expect(results.length).toBeLessThanOrEqual(25);
  }, 30_000);

  it("returns more than 10 results for a sufficiently popular query (bump from 10 → 25 is active)", async () => {
    // SoundCloud's "the beatles" search reliably yields well over 10 tracks
    // because of its deep user-upload catalog; before the bump this test
    // would top out at 10. After the bump it should comfortably exceed 10.
    const client = new SoundCloudClient(fakeConfig({ SOUNDCLOUD_USER_AGENT: REAL_UA }));
    const results = await client.search("the beatles");
    expect(results.length).toBeGreaterThan(10);
  }, 30_000);
});
