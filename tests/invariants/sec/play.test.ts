// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under SEC-07, SEC-08.

import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import {
  buildPlayTestApp,
  makeSnapshot,
  PLAY_TEST_ENV,
  type PlayTestAppHandle,
} from "../_helpers/play-test-app.js";

const FAKE_CLIENT_ID = "FAKE-CLIENT-ID-DO-NOT-LEAK-XYZ";

describe("SEC-07: SOUNDCLOUD_USER_AGENT and the SoundCloud client_id never appear in any HTTP response body", () => {
  let h: PlayTestAppHandle | undefined;
  afterEach(async () => {
    if (h) await h.app.close();
    h = undefined;
  });

  it("the configured SOUNDCLOUD_USER_AGENT value is not present in a successful resolve response (audius hit)", async () => {
    h = await buildPlayTestApp();
    h.audius.match = { sourceTrackId: "abc", sourceLocator: "abc" };
    const res = await request(h.app.getHttpServer())
      .post("/api/play/resolve")
      .send({ snapshot: makeSnapshot() })
      .set("Content-Type", "application/json");
    const bodyText = JSON.stringify(res.body ?? "");
    expect(bodyText).not.toContain(PLAY_TEST_ENV.SOUNDCLOUD_USER_AGENT);
  });

  it("the SoundCloud client_id from upstream HTML is not present in a soundcloud-source response", async () => {
    h = await buildPlayTestApp();
    h.soundcloud.match = {
      sourceTrackId: "12345",
      sourceLocator: "https://soundcloud.com/artist/track",
    };
    h.soundcloud.produceResult = {
      streamUrl: "https://cf-media.example/audio.mp3?token=opaque",
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    };
    const res = await request(h.app.getHttpServer())
      .post("/api/play/resolve")
      .send({ snapshot: makeSnapshot() })
      .set("Content-Type", "application/json");
    const bodyText = JSON.stringify(res.body ?? "");
    expect(bodyText).not.toContain(FAKE_CLIENT_ID);
    expect(bodyText).not.toContain(PLAY_TEST_ENV.SOUNDCLOUD_USER_AGENT);
  });

  it("the SOUNDCLOUD_USER_AGENT value is not present in a 400 ErrorResponse", async () => {
    h = await buildPlayTestApp();
    const res = await request(h.app.getHttpServer())
      .post("/api/play/resolve")
      .send({})
      .set("Content-Type", "application/json");
    expect(res.status).toBe(400);
    const bodyText = JSON.stringify(res.body ?? "");
    expect(bodyText).not.toContain(PLAY_TEST_ENV.SOUNDCLOUD_USER_AGENT);
  });
});

import { buildSearchTestApp, SEARCH_TEST_ENV } from "../_helpers/search-test-app.js";
import type { SearchTestAppHandle } from "../_helpers/search-test-app.js";

describe("SEC-07 (search code path): SOUNDCLOUD_USER_AGENT and SoundCloud client_id never appear in /api/search responses", () => {
  let h: SearchTestAppHandle | undefined;
  afterEach(async () => {
    if (h) await h.app.close();
    h = undefined;
  });

  it("the SOUNDCLOUD_USER_AGENT value is not present in a successful /api/search response", async () => {
    h = await buildSearchTestApp();
    h.soundcloud.results = [
      {
        type: "track",
        id: "soundcloud:1",
        title: "Sample",
        artist: "Sample Artist",
        provider: "soundcloud",
        providerId: "1",
        sources: ["soundcloud"],
      },
    ];
    const res = await request(h.app.getHttpServer())
      .post("/api/search")
      .send({ q: "sample" })
      .set("Content-Type", "application/json");
    expect(res.status).toBe(200);
    const bodyText = JSON.stringify(res.body ?? "");
    expect(bodyText).not.toContain(SEARCH_TEST_ENV.SOUNDCLOUD_USER_AGENT);
  });

  it("the SOUNDCLOUD_USER_AGENT value is not present in a /api/search response when the provider failed", async () => {
    h = await buildSearchTestApp();
    h.soundcloud.shouldFail = true;
    const res = await request(h.app.getHttpServer())
      .post("/api/search")
      .send({ q: "sample" })
      .set("Content-Type", "application/json");
    expect(res.status).toBe(200);
    const bodyText = JSON.stringify(res.body ?? "");
    expect(bodyText).not.toContain(SEARCH_TEST_ENV.SOUNDCLOUD_USER_AGENT);
  });

  it("the SOUNDCLOUD_USER_AGENT value is not present in a 400 ErrorResponse from /api/search", async () => {
    h = await buildSearchTestApp();
    const res = await request(h.app.getHttpServer())
      .post("/api/search")
      .send({ q: "" })
      .set("Content-Type", "application/json");
    expect(res.status).toBe(400);
    const bodyText = JSON.stringify(res.body ?? "");
    expect(bodyText).not.toContain(SEARCH_TEST_ENV.SOUNDCLOUD_USER_AGENT);
  });
});

import {
  buildPlayEventsTestApp,
  type PlayEventsTestAppHandle,
} from "../_helpers/play-events-test-app.js";

const VALID_BODY = {
  source: "audius" as const,
  externalId: "abc123",
  snapshot: { title: "Get Lucky", artist: "Daft Punk", kind: "track" as const },
};

describe("SEC-08: /play/started and /play/completed always derive userId from the session, never from the body", () => {
  let eventsHandle: PlayEventsTestAppHandle | undefined;
  afterEach(async () => {
    if (eventsHandle) await eventsHandle.app.close();
    eventsHandle = undefined;
  });

  it("a body field 'userId' targeting victimId is ignored — the upsert lands under the session's uid", async () => {
    eventsHandle = await buildPlayEventsTestApp();
    const sessionUid = "550e8400-e29b-41d4-a716-446655440300";
    const victimId = "550e8400-e29b-41d4-a716-446655440301";
    const token = eventsHandle.authService.signSession({ uid: sessionUid, gid: "g_sec_smuggle" });
    const res = await request(eventsHandle.app.getHttpServer())
      .post("/api/play/started")
      .send({ ...VALID_BODY, userId: victimId })
      .set("Content-Type", "application/json")
      .set("Cookie", `session=${token}`);
    expect(res.status).toBe(204);
    expect(await eventsHandle.interestRepo.findScoresForUser(sessionUid)).toHaveLength(1);
    expect(await eventsHandle.interestRepo.findScoresForUser(victimId)).toHaveLength(0);
    expect(await eventsHandle.listeningRepo.findEventsForUser(sessionUid)).toHaveLength(1);
    expect(await eventsHandle.listeningRepo.findEventsForUser(victimId)).toHaveLength(0);
  });

  it("with no session cookie the call is rejected with 401 before any DB write happens", async () => {
    eventsHandle = await buildPlayEventsTestApp();
    const res = await request(eventsHandle.app.getHttpServer())
      .post("/api/play/completed")
      .send({ ...VALID_BODY, elapsedMs: 1234 })
      .set("Content-Type", "application/json");
    expect(res.status).toBe(401);
    expect(eventsHandle.listeningRepo.events).toHaveLength(0);
    expect(eventsHandle.interestRepo.docs.size).toBe(0);
  });

  it("user A's listening_events / interest_scores writes are scoped to A's userId, not B's", async () => {
    eventsHandle = await buildPlayEventsTestApp();
    const userA = "550e8400-e29b-41d4-a716-446655440310";
    const userB = "550e8400-e29b-41d4-a716-446655440311";
    const tokenA = eventsHandle.authService.signSession({ uid: userA, gid: "g_user_a" });
    const tokenB = eventsHandle.authService.signSession({ uid: userB, gid: "g_user_b" });
    await request(eventsHandle.app.getHttpServer())
      .post("/api/play/started")
      .send(VALID_BODY)
      .set("Content-Type", "application/json")
      .set("Cookie", `session=${tokenA}`)
      .expect(204);
    await request(eventsHandle.app.getHttpServer())
      .post("/api/play/completed")
      .send({ ...VALID_BODY, elapsedMs: 60_000 })
      .set("Content-Type", "application/json")
      .set("Cookie", `session=${tokenB}`)
      .expect(204);

    const aScores = await eventsHandle.interestRepo.findScoresForUser(userA);
    const bScores = await eventsHandle.interestRepo.findScoresForUser(userB);
    expect(aScores.every((d) => d.userId === userA)).toBe(true);
    expect(bScores.every((d) => d.userId === userB)).toBe(true);
    expect(aScores.find((d) => d.userId === userB)).toBeUndefined();
    expect(bScores.find((d) => d.userId === userA)).toBeUndefined();

    const aEvents = await eventsHandle.listeningRepo.findEventsForUser(userA);
    const bEvents = await eventsHandle.listeningRepo.findEventsForUser(userB);
    expect(aEvents.every((e) => e.userId === userA)).toBe(true);
    expect(bEvents.every((e) => e.userId === userB)).toBe(true);
  });
});
