// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under API-08, API-09, API-10, API-11.
// Real-provider integration tests (no mocking) are at the bottom of this file.
// Per hard rule #15, SoundCloud and Audius clients call the actual upstream.

import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import { ErrorResponse, ResolveResponse } from "@moc/contracts";
import type { ConfigService } from "@nestjs/config";
import {
  buildPlayTestApp,
  makeSnapshot,
  type PlayTestAppHandle,
} from "../_helpers/play-test-app.js";
import { SoundCloudStreamClient } from "../../../apps/api/src/modules/play/providers/soundcloud-stream.client.js";
import { AudiusStreamClient } from "../../../apps/api/src/modules/play/providers/audius-stream.client.js";

describe("API-08: POST /api/play/resolve is publicly accessible; rejects empty/invalid body with 400; never 404 on unmatched", () => {
  let h: PlayTestAppHandle | undefined;
  afterEach(async () => {
    if (h) await h.app.close();
    h = undefined;
  });

  it("returns non-401 without a session cookie", async () => {
    h = await buildPlayTestApp();
    const res = await request(h.app.getHttpServer())
      .post("/api/play/resolve")
      .send({ snapshot: makeSnapshot() })
      .set("Content-Type", "application/json");
    expect(res.status).not.toBe(401);
  });

  it("returns 400 + ErrorResponse when body is empty", async () => {
    h = await buildPlayTestApp();
    const res = await request(h.app.getHttpServer())
      .post("/api/play/resolve")
      .send({})
      .set("Content-Type", "application/json");
    expect(res.status).toBe(400);
    expect(() => ErrorResponse.parse(res.body)).not.toThrow();
  });

  it("returns 400 + ErrorResponse when snapshot is missing required fields", async () => {
    h = await buildPlayTestApp();
    const res = await request(h.app.getHttpServer())
      .post("/api/play/resolve")
      .send({ snapshot: { title: "" } })
      .set("Content-Type", "application/json");
    expect(res.status).toBe(400);
    expect(() => ErrorResponse.parse(res.body)).not.toThrow();
  });

  it("returns 200 with source: null when neither provider matches (never 404 for an unmatched track)", async () => {
    h = await buildPlayTestApp();
    // Both providers return null for findMatch by default — no match.
    const res = await request(h.app.getHttpServer())
      .post("/api/play/resolve")
      .send({ snapshot: makeSnapshot({ title: "asdjkhasd", artist: "qwertyzx" }) })
      .set("Content-Type", "application/json");
    expect(res.status).toBe(200);
    const body = ResolveResponse.parse(res.body);
    expect(body.source).toBeNull();
    expect(body.streamUrl).toBeNull();
    expect(body.sourceTrackId).toBeNull();
    expect(body.expiresAt).toBeNull();
  });
});

describe("API-09: POST /api/play/resolve always returns 200 + ResolveResponse, even when every provider fails", () => {
  let h: PlayTestAppHandle | undefined;
  afterEach(async () => {
    if (h) await h.app.close();
    h = undefined;
  });

  it("response body matches ResolveResponse schema for an Audius match", async () => {
    h = await buildPlayTestApp();
    h.audius.match = { sourceTrackId: "audius-abc", sourceLocator: "audius-abc" };
    const res = await request(h.app.getHttpServer())
      .post("/api/play/resolve")
      .send({ snapshot: makeSnapshot() })
      .set("Content-Type", "application/json");
    expect(res.status).toBe(200);
    const body = ResolveResponse.parse(res.body);
    expect(body.source).toBe("audius");
    expect(body.sourceTrackId).toBe("audius-abc");
    expect(typeof body.streamUrl).toBe("string");
  });

  it("response body matches ResolveResponse schema when both findMatch calls throw (provider failure)", async () => {
    h = await buildPlayTestApp();
    h.audius.shouldFailFind = true;
    h.soundcloud.shouldFailFind = true;
    const res = await request(h.app.getHttpServer())
      .post("/api/play/resolve")
      .send({ snapshot: makeSnapshot() })
      .set("Content-Type", "application/json");
    expect(res.status).toBe(200);
    const body = ResolveResponse.parse(res.body);
    expect(body.source).toBeNull();
    expect(body.streamUrl).toBeNull();
  });

  it("Audius hit + SoundCloud failure still returns the Audius result (provider isolation)", async () => {
    h = await buildPlayTestApp();
    h.audius.match = { sourceTrackId: "aud-1", sourceLocator: "aud-1" };
    h.soundcloud.shouldFailFind = true; // never reached, but tolerate it if it were
    const res = await request(h.app.getHttpServer())
      .post("/api/play/resolve")
      .send({ snapshot: makeSnapshot() })
      .set("Content-Type", "application/json");
    expect(res.status).toBe(200);
    const body = ResolveResponse.parse(res.body);
    expect(body.source).toBe("audius");
  });
});

// ── Real-provider integration tests (no mocking) ──────────────────────────────
// These call the actual SoundCloud and Audius upstreams.
// Per hard rule #15, provider clients are NOT mocked — these tests reveal
// real upstream shape changes and broken scraping before they hit production.

const DEFAULT_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

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

// "Get Lucky" is confirmed available on SoundCloud's official Daft Punk page.
const SC_TRACK = { title: "Get Lucky", artist: "Daft Punk", kind: "track" as const };
// "Please Please Please" by Sabrina Carpenter — exercises the HTML-parsing path
// because the track page exposes full transcodings in __sc_hydration (sound entry).
const SC_TRACK_HTML_PATH = {
  title: "Please Please Please",
  artist: "Sabrina Carpenter",
  kind: "track" as const,
};
// "Don't Stop The Music" by Rihanna — exercises the API fallback path
// because the track page does not embed full progressive transcodings in the SSR hydration,
// so produceStreamUrl falls back to streamViaResolveApi.
const SC_TRACK_API_PATH = {
  title: "Don't Stop The Music",
  artist: "Rihanna",
  kind: "track" as const,
};
// "Ghosts N Stuff" by deadmau5 is confirmed available directly on Audius.
const AUDIUS_TRACK = { title: "Ghosts N Stuff", artist: "deadmau5", kind: "track" as const };

describe("SoundCloudStreamClient: real provider (no mocking)", () => {
  it("findMatch returns a non-null result with sourceTrackId and a soundcloud.com permalink", async () => {
    const client = new SoundCloudStreamClient(fakeConfig({ SOUNDCLOUD_USER_AGENT: DEFAULT_UA }));
    const result = await client.findMatch(SC_TRACK);
    expect(result).not.toBeNull();
    expect(typeof result?.sourceTrackId).toBe("string");
    expect(result?.sourceTrackId.length).toBeGreaterThan(0);
    expect(result?.sourceLocator).toMatch(/^https:\/\/soundcloud\.com\//);
  }, 20_000);

  it("produceStreamUrl always returns a valid HTTPS non-preview stream URL (falls back to non-snipped alternative when official track is snippet-gated)", async () => {
    const client = new SoundCloudStreamClient(fakeConfig({ SOUNDCLOUD_USER_AGENT: DEFAULT_UA }));
    // findMatch now prefers non-snipped candidates; for snippet-gated tracks like
    // Daft Punk / Columbia it falls back to a remix/cover with non-snipped transcodings.
    const match = await client.findMatch(SC_TRACK);
    if (!match) {
      throw new Error("SoundCloud findMatch returned null — real SoundCloud integration is broken");
    }
    const stream = await client.produceStreamUrl(match.sourceLocator);
    expect(stream).not.toBeNull();
    expect(stream?.streamUrl).toMatch(/^https?:\/\//);
    expect(stream?.streamUrl).not.toContain("/preview/");
    expect(typeof stream?.expiresAt).toBe("string");
  }, 45_000);

  it("produceStreamUrl (HTML-parse path): Please Please Please by Sabrina Carpenter returns a full stream URL without 'preview'", async () => {
    const client = new SoundCloudStreamClient(fakeConfig({ SOUNDCLOUD_USER_AGENT: DEFAULT_UA }));
    const match = await client.findMatch(SC_TRACK_HTML_PATH);
    if (!match) {
      throw new Error(
        "SoundCloud findMatch returned null for Sabrina Carpenter — integration is broken",
      );
    }
    expect(match.sourceLocator).toMatch(/^https:\/\/soundcloud\.com\//);
    const stream = await client.produceStreamUrl(match.sourceLocator);
    expect(stream).not.toBeNull();
    expect(stream?.streamUrl).toMatch(/^https?:\/\//);
    // Must not be a snipped/preview URL — preview paths contain "/preview/" in the transcoding URL
    expect(stream?.streamUrl).not.toContain("/preview/");
  }, 40_000);

  it("produceStreamUrl (API fallback path): Don't Stop The Music by Rihanna always returns a full non-preview stream URL (finds non-snipped alternative when official track is snippet-gated)", async () => {
    const client = new SoundCloudStreamClient(fakeConfig({ SOUNDCLOUD_USER_AGENT: DEFAULT_UA }));
    // findMatch now falls back to a remix/cover with non-snipped transcodings when the
    // official Rihanna track (Def Jam / SoundCloud Go) has snippet-only access.
    const match = await client.findMatch(SC_TRACK_API_PATH);
    if (!match) {
      throw new Error("SoundCloud findMatch returned null for Rihanna — integration is broken");
    }
    expect(match.sourceLocator).toMatch(/^https:\/\/soundcloud\.com\//);
    const stream = await client.produceStreamUrl(match.sourceLocator);
    expect(stream).not.toBeNull();
    expect(stream?.streamUrl).toMatch(/^https?:\/\//);
    expect(stream?.streamUrl).not.toContain("/preview/");
  }, 55_000);
});

import {
  buildPlayEventsTestApp,
  type PlayEventsTestAppHandle,
} from "../_helpers/play-events-test-app.js";

const VALID_STARTED_BODY = {
  source: "audius" as const,
  externalId: "abc123",
  snapshot: { title: "Get Lucky", artist: "Daft Punk", kind: "track" as const },
};

const VALID_COMPLETED_BODY = {
  ...VALID_STARTED_BODY,
  elapsedMs: 249_000,
};

describe("API-10: POST /play/started and POST /play/completed require a valid session; 401 without; 204 with valid", () => {
  let h: PlayEventsTestAppHandle | undefined;
  afterEach(async () => {
    if (h) await h.app.close();
    h = undefined;
  });

  it("POST /api/play/started returns 401 + ErrorResponse without a session cookie", async () => {
    h = await buildPlayEventsTestApp();
    const res = await request(h.app.getHttpServer())
      .post("/api/play/started")
      .send(VALID_STARTED_BODY)
      .set("Content-Type", "application/json");
    expect(res.status).toBe(401);
    expect(() => ErrorResponse.parse(res.body)).not.toThrow();
  });

  it("POST /api/play/completed returns 401 + ErrorResponse without a session cookie", async () => {
    h = await buildPlayEventsTestApp();
    const res = await request(h.app.getHttpServer())
      .post("/api/play/completed")
      .send(VALID_COMPLETED_BODY)
      .set("Content-Type", "application/json");
    expect(res.status).toBe(401);
    expect(() => ErrorResponse.parse(res.body)).not.toThrow();
  });

  it("POST /api/play/started returns 204 with no body for a valid session and matching body", async () => {
    h = await buildPlayEventsTestApp();
    const userId = "550e8400-e29b-41d4-a716-446655440200";
    const token = h.authService.signSession({ uid: userId, gid: "g_started_ok" });
    const res = await request(h.app.getHttpServer())
      .post("/api/play/started")
      .send(VALID_STARTED_BODY)
      .set("Content-Type", "application/json")
      .set("Cookie", `session=${token}`);
    expect(res.status).toBe(204);
    expect(res.body).toEqual({});
    const events = await h.listeningRepo.findEventsForUser(userId);
    expect(events).toHaveLength(1);
    expect(events[0]!.eventType).toBe("started");
    expect(events[0]!.elapsedMs).toBe(0);
    const scores = await h.interestRepo.findScoresForUser(userId);
    expect(scores).toHaveLength(1);
    expect(scores[0]!.score).toBe(3);
    expect(scores[0]!.lastEventType).toBe("explored");
  });

  it("POST /api/play/completed returns 204 with no body for a valid session and matching body", async () => {
    h = await buildPlayEventsTestApp();
    const userId = "550e8400-e29b-41d4-a716-446655440201";
    const token = h.authService.signSession({ uid: userId, gid: "g_completed_ok" });
    const res = await request(h.app.getHttpServer())
      .post("/api/play/completed")
      .send(VALID_COMPLETED_BODY)
      .set("Content-Type", "application/json")
      .set("Cookie", `session=${token}`);
    expect(res.status).toBe(204);
    expect(res.body).toEqual({});
    const events = await h.listeningRepo.findEventsForUser(userId);
    expect(events).toHaveLength(1);
    expect(events[0]!.eventType).toBe("completed");
    expect(events[0]!.elapsedMs).toBe(249_000);
    const scores = await h.interestRepo.findScoresForUser(userId);
    expect(scores).toHaveLength(1);
    expect(scores[0]!.score).toBe(5);
    expect(scores[0]!.lastEventType).toBe("completed");
  });

  it("a /completed event for a previously /saved track keeps score at 8 (max-rule) but updates lastEventType", async () => {
    h = await buildPlayEventsTestApp();
    const userId = "550e8400-e29b-41d4-a716-446655440202";
    // Pre-seed a "saved" event (score 8) directly via the fake repo.
    await h.interestRepo.upsertEvent({
      userId,
      source: "audius",
      externalId: "abc123",
      snapshot: VALID_STARTED_BODY.snapshot,
      eventType: "saved",
    });

    const token = h.authService.signSession({ uid: userId, gid: "g_saved_then_completed" });
    const res = await request(h.app.getHttpServer())
      .post("/api/play/completed")
      .send(VALID_COMPLETED_BODY)
      .set("Content-Type", "application/json")
      .set("Cookie", `session=${token}`);
    expect(res.status).toBe(204);
    const scores = await h.interestRepo.findScoresForUser(userId);
    expect(scores).toHaveLength(1);
    expect(scores[0]!.score).toBe(8);
    expect(scores[0]!.lastEventType).toBe("completed");
  });
});

describe("API-11: POST /play/started and POST /play/completed validate body and ignore body userId", () => {
  let h: PlayEventsTestAppHandle | undefined;
  afterEach(async () => {
    if (h) await h.app.close();
    h = undefined;
  });

  it("POST /api/play/started returns 400 + ErrorResponse when source is missing", async () => {
    h = await buildPlayEventsTestApp();
    const userId = "550e8400-e29b-41d4-a716-446655440210";
    const token = h.authService.signSession({ uid: userId, gid: "g_invalid_started_source" });
    const res = await request(h.app.getHttpServer())
      .post("/api/play/started")
      .send({ externalId: "abc", snapshot: VALID_STARTED_BODY.snapshot })
      .set("Content-Type", "application/json")
      .set("Cookie", `session=${token}`);
    expect(res.status).toBe(400);
    expect(() => ErrorResponse.parse(res.body)).not.toThrow();
  });

  it("POST /api/play/started returns 400 + ErrorResponse when externalId is empty", async () => {
    h = await buildPlayEventsTestApp();
    const userId = "550e8400-e29b-41d4-a716-446655440211";
    const token = h.authService.signSession({ uid: userId, gid: "g_invalid_started_extid" });
    const res = await request(h.app.getHttpServer())
      .post("/api/play/started")
      .send({ source: "audius", externalId: "", snapshot: VALID_STARTED_BODY.snapshot })
      .set("Content-Type", "application/json")
      .set("Cookie", `session=${token}`);
    expect(res.status).toBe(400);
    expect(() => ErrorResponse.parse(res.body)).not.toThrow();
  });

  it("POST /api/play/completed returns 400 + ErrorResponse when elapsedMs is missing", async () => {
    h = await buildPlayEventsTestApp();
    const userId = "550e8400-e29b-41d4-a716-446655440212";
    const token = h.authService.signSession({ uid: userId, gid: "g_invalid_completed_no_ms" });
    const res = await request(h.app.getHttpServer())
      .post("/api/play/completed")
      .send(VALID_STARTED_BODY)
      .set("Content-Type", "application/json")
      .set("Cookie", `session=${token}`);
    expect(res.status).toBe(400);
    expect(() => ErrorResponse.parse(res.body)).not.toThrow();
  });

  it("POST /api/play/completed returns 400 + ErrorResponse when elapsedMs is negative", async () => {
    h = await buildPlayEventsTestApp();
    const userId = "550e8400-e29b-41d4-a716-446655440213";
    const token = h.authService.signSession({ uid: userId, gid: "g_invalid_completed_neg" });
    const res = await request(h.app.getHttpServer())
      .post("/api/play/completed")
      .send({ ...VALID_COMPLETED_BODY, elapsedMs: -1 })
      .set("Content-Type", "application/json")
      .set("Cookie", `session=${token}`);
    expect(res.status).toBe(400);
    expect(() => ErrorResponse.parse(res.body)).not.toThrow();
  });

  it("any userId field present in the body is ignored — server uses the session's uid", async () => {
    h = await buildPlayEventsTestApp();
    const sessionUid = "550e8400-e29b-41d4-a716-446655440220";
    const victimId = "550e8400-e29b-41d4-a716-446655440999";
    const token = h.authService.signSession({ uid: sessionUid, gid: "g_userid_smuggle" });
    const res = await request(h.app.getHttpServer())
      .post("/api/play/started")
      // Smuggle a "userId" field — controller must ignore it.
      .send({ ...VALID_STARTED_BODY, userId: victimId })
      .set("Content-Type", "application/json")
      .set("Cookie", `session=${token}`);
    expect(res.status).toBe(204);

    const sessionScores = await h.interestRepo.findScoresForUser(sessionUid);
    expect(sessionScores).toHaveLength(1);
    const victimScores = await h.interestRepo.findScoresForUser(victimId);
    expect(victimScores).toHaveLength(0);

    const sessionEvents = await h.listeningRepo.findEventsForUser(sessionUid);
    expect(sessionEvents).toHaveLength(1);
    const victimEvents = await h.listeningRepo.findEventsForUser(victimId);
    expect(victimEvents).toHaveLength(0);
  });
});

describe("AudiusStreamClient: real provider (no mocking)", () => {
  it("findMatch returns a non-null result for a track confirmed on Audius", async () => {
    const client = new AudiusStreamClient(fakeConfig({ AUDIUS_APP_NAME: "moc-test" }));
    const result = await client.findMatch(AUDIUS_TRACK);
    expect(result).not.toBeNull();
    expect(typeof result?.sourceTrackId).toBe("string");
    expect(result?.sourceTrackId.length).toBeGreaterThan(0);
  }, 20_000);

  it("produceStreamUrl returns a stable Audius stream redirect URL (no network call needed)", () => {
    const client = new AudiusStreamClient(fakeConfig({ AUDIUS_APP_NAME: "moc-test" }));
    const result = client.produceStreamUrl("some-track-id");
    expect(result.streamUrl).toMatch(/^https:\/\/api\.audius\.co\/v1\/tracks\//);
    expect(result.expiresAt).toBeNull();
  });
});
