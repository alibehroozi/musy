// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under API-22 and API-23.
// Per AGENTS.md hard rule #15, the SoundCloud client used by these tests is
// the FakeSoundCloudStreamClient from the shared play-test-app helper — the
// only sanctioned exception (we're asserting picker semantics, not upstream
// behavior; the upstream HTTP shape is pinned by the real-provider tests in
// api/play.test.ts and logic/play.test.ts under LOGIC-13).

import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import { ErrorResponse, ResolveResponse } from "@moc/contracts";
import {
  buildPlayTestApp,
  makeSnapshot,
  type PlayTestAppHandle,
} from "../_helpers/play-test-app.js";

const SNAPSHOT = makeSnapshot({ title: "Without Me", artist: "Eminem" });

interface AuthedSession {
  cookie: string;
  userId: string;
}

async function seedSession(h: PlayTestAppHandle): Promise<AuthedSession> {
  const user = {
    id: "550e8400-e29b-41d4-a716-446655440042",
    email: "badremix-tester@example.com",
    googleId: "google-bad-remix-test",
    createdAt: "2026-05-12T00:00:00.000Z",
  };
  await h.usersRepo.create(user);
  const token = h.authService.signSession({ uid: user.id, gid: user.googleId });
  return { cookie: `session=${token}`, userId: user.id };
}

describe("API-22: POST /api/play/reresolve — session-gated, schema-validated, picks next-most-played un-tried candidate, bumps score", () => {
  let h: PlayTestAppHandle | undefined;
  afterEach(async () => {
    if (h) await h.app.close();
    h = undefined;
  });

  it("returns 401 + ErrorResponse without a valid session cookie", async () => {
    h = await buildPlayTestApp();
    const res = await request(h.app.getHttpServer())
      .post("/api/play/reresolve")
      .send({ snapshot: SNAPSHOT, currentSourceTrackId: "sc-1" })
      .set("Content-Type", "application/json");
    expect(res.status).toBe(401);
    expect(() => ErrorResponse.parse(res.body)).not.toThrow();
  });

  it("returns 400 + ErrorResponse when the body is empty", async () => {
    h = await buildPlayTestApp();
    const session = await seedSession(h);
    const res = await request(h.app.getHttpServer())
      .post("/api/play/reresolve")
      .set("Cookie", session.cookie)
      .send({})
      .set("Content-Type", "application/json");
    expect(res.status).toBe(400);
    expect(() => ErrorResponse.parse(res.body)).not.toThrow();
  });

  it("returns 400 + ErrorResponse when currentSourceTrackId is missing", async () => {
    h = await buildPlayTestApp();
    const session = await seedSession(h);
    const res = await request(h.app.getHttpServer())
      .post("/api/play/reresolve")
      .set("Cookie", session.cookie)
      .send({ snapshot: SNAPSHOT })
      .set("Content-Type", "application/json");
    expect(res.status).toBe(400);
    expect(() => ErrorResponse.parse(res.body)).not.toThrow();
  });

  it("returns 200 with a body matching ResolveResponse on success", async () => {
    h = await buildPlayTestApp();
    const session = await seedSession(h);
    h.soundcloud.excludingResults = [
      { sourceTrackId: "sc-next", sourceLocator: "https://soundcloud.com/u/sc-next" },
    ];
    h.soundcloud.produceByLocator.set("https://soundcloud.com/u/sc-next", {
      streamUrl: "https://stream.example/sc-next.mp3",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });

    const res = await request(h.app.getHttpServer())
      .post("/api/play/reresolve")
      .set("Cookie", session.cookie)
      .send({ snapshot: SNAPSHOT, currentSourceTrackId: "sc-current" })
      .set("Content-Type", "application/json");

    expect(res.status).toBe(200);
    const body = ResolveResponse.parse(res.body);
    expect(body.source).toBe("soundcloud");
    expect(body.sourceTrackId).toBe("sc-next");
    expect(body.streamUrl).toBe("https://stream.example/sc-next.mp3");
  });

  it("writes a resolution_preferences document with score = 1 when none existed for this snapshotHash", async () => {
    h = await buildPlayTestApp();
    const session = await seedSession(h);
    h.soundcloud.excludingResults = [
      { sourceTrackId: "sc-first", sourceLocator: "https://soundcloud.com/u/sc-first" },
    ];
    h.soundcloud.produceByLocator.set("https://soundcloud.com/u/sc-first", {
      streamUrl: "https://stream.example/sc-first.mp3",
      expiresAt: null as unknown as string,
    });

    await request(h.app.getHttpServer())
      .post("/api/play/reresolve")
      .set("Cookie", session.cookie)
      .send({ snapshot: SNAPSHOT, currentSourceTrackId: "sc-current" })
      .set("Content-Type", "application/json");

    expect(h.prefs.saved).toHaveLength(1);
    expect(h.prefs.saved[0]?.score).toBe(1);
    expect(h.prefs.saved[0]?.sourceTrackId).toBe("sc-first");
  });

  it("writes score = (current max for snapshotHash) + 1 when at least one already exists", async () => {
    h = await buildPlayTestApp();
    const session = await seedSession(h);
    // Pre-seed two preferences with scores 1 and 3 — max is 3.
    h.prefs.store = [
      {
        snapshotHash: await computeHashFor(SNAPSHOT),
        source: "soundcloud",
        sourceTrackId: "sc-old-1",
        sourceLocator: "https://soundcloud.com/u/sc-old-1",
        score: 1,
        chosenAt: new Date(),
      },
      {
        snapshotHash: await computeHashFor(SNAPSHOT),
        source: "soundcloud",
        sourceTrackId: "sc-old-2",
        sourceLocator: "https://soundcloud.com/u/sc-old-2",
        score: 3,
        chosenAt: new Date(),
      },
    ];
    h.soundcloud.excludingResults = [
      { sourceTrackId: "sc-fresh", sourceLocator: "https://soundcloud.com/u/sc-fresh" },
    ];
    h.soundcloud.produceByLocator.set("https://soundcloud.com/u/sc-fresh", {
      streamUrl: "https://stream.example/sc-fresh.mp3",
      expiresAt: null as unknown as string,
    });

    await request(h.app.getHttpServer())
      .post("/api/play/reresolve")
      .set("Cookie", session.cookie)
      .send({ snapshot: SNAPSHOT, currentSourceTrackId: "sc-current" })
      .set("Content-Type", "application/json");

    expect(h.prefs.saved).toHaveLength(1);
    expect(h.prefs.saved[0]?.score).toBe(4);
  });

  it("passes the union of currentSourceTrackId + existing preferences as the picker's excludeIds", async () => {
    h = await buildPlayTestApp();
    const session = await seedSession(h);
    h.prefs.store = [
      {
        snapshotHash: await computeHashFor(SNAPSHOT),
        source: "soundcloud",
        sourceTrackId: "sc-A",
        sourceLocator: "https://soundcloud.com/u/sc-A",
        score: 1,
        chosenAt: new Date(),
      },
      {
        snapshotHash: await computeHashFor(SNAPSHOT),
        source: "soundcloud",
        sourceTrackId: "sc-B",
        sourceLocator: "https://soundcloud.com/u/sc-B",
        score: 2,
        chosenAt: new Date(),
      },
    ];
    h.soundcloud.excludingResults = [
      { sourceTrackId: "sc-C", sourceLocator: "https://soundcloud.com/u/sc-C" },
    ];
    h.soundcloud.produceByLocator.set("https://soundcloud.com/u/sc-C", {
      streamUrl: "https://stream.example/sc-C.mp3",
      expiresAt: null as unknown as string,
    });

    await request(h.app.getHttpServer())
      .post("/api/play/reresolve")
      .set("Cookie", session.cookie)
      .send({ snapshot: SNAPSHOT, currentSourceTrackId: "sc-current" })
      .set("Content-Type", "application/json");

    expect(h.soundcloud.excludingCalls).toHaveLength(1);
    const excluded = new Set(h.soundcloud.excludingCalls[0]?.excludeIds);
    expect(excluded.has("sc-current")).toBe(true);
    expect(excluded.has("sc-A")).toBe(true);
    expect(excluded.has("sc-B")).toBe(true);
  });

  it("returns { source: null, ... } and writes no document when every candidate is already tried", async () => {
    h = await buildPlayTestApp();
    const session = await seedSession(h);
    // Picker has nothing playable to offer.
    h.soundcloud.excludingResults = [];

    const res = await request(h.app.getHttpServer())
      .post("/api/play/reresolve")
      .set("Cookie", session.cookie)
      .send({ snapshot: SNAPSHOT, currentSourceTrackId: "sc-current" })
      .set("Content-Type", "application/json");

    expect(res.status).toBe(200);
    const body = ResolveResponse.parse(res.body);
    expect(body.source).toBeNull();
    expect(body.sourceTrackId).toBeNull();
    expect(body.streamUrl).toBeNull();
    expect(body.expiresAt).toBeNull();
    expect(h.prefs.saved).toHaveLength(0);
  });
});

describe("API-23: POST /api/play/resolve consults resolution_preferences before the cache + upstream path", () => {
  let h: PlayTestAppHandle | undefined;
  afterEach(async () => {
    if (h) await h.app.close();
    h = undefined;
  });

  it("returns source/sourceTrackId from the highest-score preference doc when one exists", async () => {
    h = await buildPlayTestApp();
    const hash = await computeHashFor(SNAPSHOT);
    h.prefs.store = [
      {
        snapshotHash: hash,
        source: "soundcloud",
        sourceTrackId: "sc-low",
        sourceLocator: "https://soundcloud.com/u/sc-low",
        score: 1,
        chosenAt: new Date(),
      },
      {
        snapshotHash: hash,
        source: "soundcloud",
        sourceTrackId: "sc-winner",
        sourceLocator: "https://soundcloud.com/u/sc-winner",
        score: 7,
        chosenAt: new Date(),
      },
    ];
    h.soundcloud.produceByLocator.set("https://soundcloud.com/u/sc-winner", {
      streamUrl: "https://stream.example/sc-winner.mp3",
      expiresAt: null as unknown as string,
    });

    const res = await request(h.app.getHttpServer())
      .post("/api/play/resolve")
      .send({ snapshot: SNAPSHOT })
      .set("Content-Type", "application/json");

    expect(res.status).toBe(200);
    const body = ResolveResponse.parse(res.body);
    expect(body.source).toBe("soundcloud");
    expect(body.sourceTrackId).toBe("sc-winner");
    expect(body.streamUrl).toBe("https://stream.example/sc-winner.mp3");
  });

  it("when a preference doc exists, the upstream SoundCloud/Audius findMatch is never called", async () => {
    h = await buildPlayTestApp();
    const hash = await computeHashFor(SNAPSHOT);
    h.prefs.store = [
      {
        snapshotHash: hash,
        source: "soundcloud",
        sourceTrackId: "sc-X",
        sourceLocator: "https://soundcloud.com/u/sc-X",
        score: 1,
        chosenAt: new Date(),
      },
    ];
    h.soundcloud.produceByLocator.set("https://soundcloud.com/u/sc-X", {
      streamUrl: "https://stream.example/sc-X.mp3",
      expiresAt: null as unknown as string,
    });

    await request(h.app.getHttpServer())
      .post("/api/play/resolve")
      .send({ snapshot: SNAPSHOT })
      .set("Content-Type", "application/json");

    expect(h.soundcloud.findCalls).toHaveLength(0);
    expect(h.audius.findCalls).toHaveLength(0);
  });

  it("when no preference doc exists, the existing cache + upstream resolution path runs unchanged", async () => {
    h = await buildPlayTestApp();
    // No preferences. Upstream returns a match.
    h.audius.match = {
      sourceTrackId: "audius-1",
      sourceLocator: "audius-locator-1",
    };
    const res = await request(h.app.getHttpServer())
      .post("/api/play/resolve")
      .send({ snapshot: SNAPSHOT })
      .set("Content-Type", "application/json");

    expect(res.status).toBe(200);
    const body = ResolveResponse.parse(res.body);
    expect(body.source).toBe("audius");
    expect(body.sourceTrackId).toBe("audius-1");
    expect(h.audius.findCalls).toHaveLength(1);
  });
});

// We import dynamically to avoid hoisting api-core's playback-count picker into
// the top-level module graph before vitest has registered the suite.
async function computeHashFor(snapshot: ReturnType<typeof makeSnapshot>): Promise<string> {
  const { computeSnapshotHash } = await import("@moc/api-core");
  return computeSnapshotHash(snapshot);
}
