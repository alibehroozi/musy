// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under SEC-04, SEC-05, SEC-06.

import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import { HistoryResponse } from "@moc/contracts";
import {
  buildSearchTestApp,
  SEARCH_TEST_ENV,
  type SearchTestAppHandle,
} from "../_helpers/search-test-app.js";
import {
  buildSearchHistoryTestApp,
  type SearchHistoryTestAppHandle,
} from "../_helpers/search-history-test-app.js";

describe("SEC-04: GENIUS_ACCESS_TOKEN never appears in any HTTP response body", () => {
  let h: SearchTestAppHandle | undefined;
  afterEach(async () => {
    if (h) await h.app.close();
    h = undefined;
  });

  it("the token value is not present in a successful POST /api/search response", async () => {
    h = await buildSearchTestApp();
    const res = await request(h.app.getHttpServer())
      .post("/api/search")
      .send({ q: "daft punk" })
      .set("Content-Type", "application/json");
    const bodyText = JSON.stringify(res.body ?? "");
    expect(bodyText).not.toContain(SEARCH_TEST_ENV.GENIUS_ACCESS_TOKEN);
  });

  it("the token value is not present in a 400 error response from POST /api/search", async () => {
    h = await buildSearchTestApp();
    const res = await request(h.app.getHttpServer())
      .post("/api/search")
      .send({ q: "" })
      .set("Content-Type", "application/json");
    expect(res.status).toBe(400);
    const bodyText = JSON.stringify(res.body ?? "");
    expect(bodyText).not.toContain(SEARCH_TEST_ENV.GENIUS_ACCESS_TOKEN);
  });
});

describe("SEC-05: GET /api/search/history for user A never returns entries owned by user B", () => {
  let h: SearchHistoryTestAppHandle | undefined;
  afterEach(async () => {
    if (h) await h.app.close();
    h = undefined;
  });

  it("user A's history request only returns user A's entries, not user B's", async () => {
    h = await buildSearchHistoryTestApp();

    const userA = "550e8400-e29b-41d4-a716-44665544000a";
    const userB = "550e8400-e29b-41d4-a716-44665544000b";
    const now = Date.now();
    // Seed user A's history
    h.historyRepo.historyByUser.set(userA, [
      {
        id: "ha1",
        query: "user-a-secret-query",
        lastSearchedAt: new Date(now).toISOString(),
        searchCount: 1,
      },
    ]);
    // Seed user B's history (separate)
    h.historyRepo.historyByUser.set(userB, [
      {
        id: "hb1",
        query: "user-b-query",
        lastSearchedAt: new Date(now).toISOString(),
        searchCount: 1,
      },
    ]);

    // Request as user B
    const tokenB = h.authService.signSession({ uid: userB, gid: "g_user_b" });
    const res = await request(h.app.getHttpServer())
      .get("/api/search/history")
      .set("Cookie", `session=${tokenB}`);

    expect(res.status).toBe(200);
    const body = HistoryResponse.parse(res.body);

    // User B should only see their own entries
    const queryStrings = body.entries.map((e) => e.query);
    expect(queryStrings).not.toContain("user-a-secret-query");
    expect(queryStrings).toContain("user-b-query");
  });
});

import { FakeInterestScoresRepository } from "../_helpers/search-events-test-app.js";

describe("SEC-06: interest_scores documents are scoped per-user", () => {
  const ALICE = "550e8400-e29b-41d4-a716-446655440020";
  const BOB = "550e8400-e29b-41d4-a716-446655440021";
  const SNAP = { title: "Get Lucky", artist: "Daft Punk", kind: "track" as const };

  it("repository.findScoresForUser(A) never returns documents whose userId != A", async () => {
    const repo = new FakeInterestScoresRepository();
    await repo.upsertEvent({
      userId: ALICE,
      source: "deezer",
      externalId: "1",
      snapshot: SNAP,
      eventType: "saved",
    });
    await repo.upsertEvent({
      userId: BOB,
      source: "deezer",
      externalId: "1",
      snapshot: SNAP,
      eventType: "saved",
    });
    const aliceDocs = await repo.findScoresForUser(ALICE);
    expect(aliceDocs).toHaveLength(1);
    expect(aliceDocs.every((d) => d.userId === ALICE)).toBe(true);
  });

  it("an event written by user A creates a document with userId === A only", async () => {
    const repo = new FakeInterestScoresRepository();
    await repo.upsertEvent({
      userId: ALICE,
      source: "audius",
      externalId: "abc",
      snapshot: SNAP,
      eventType: "explored",
    });
    const bobDocs = await repo.findScoresForUser(BOB);
    expect(bobDocs).toHaveLength(0);
  });

  it("user B querying for the same songKey sees no document", async () => {
    const repo = new FakeInterestScoresRepository();
    await repo.upsertEvent({
      userId: ALICE,
      source: "audius",
      externalId: "abc",
      snapshot: SNAP,
      eventType: "saved",
    });
    const bobDocs = await repo.findScoresForUser(BOB);
    expect(bobDocs.find((d) => d.songKey === "audius:abc")).toBeUndefined();
  });
});
