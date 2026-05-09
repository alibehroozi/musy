// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under API-08, API-09.
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
  it(
    "findMatch returns a non-null result with sourceTrackId and a soundcloud.com permalink",
    async () => {
      const client = new SoundCloudStreamClient(
        fakeConfig({ SOUNDCLOUD_USER_AGENT: DEFAULT_UA }),
      );
      const result = await client.findMatch(SC_TRACK);
      expect(result).not.toBeNull();
      expect(typeof result?.sourceTrackId).toBe("string");
      expect(result?.sourceTrackId.length).toBeGreaterThan(0);
      expect(result?.sourceLocator).toMatch(/^https:\/\/soundcloud\.com\//);
    },
    20_000,
  );

  it(
    "produceStreamUrl returns a valid HTTPS non-preview stream URL, or null when only a snippet is available",
    async () => {
      const client = new SoundCloudStreamClient(
        fakeConfig({ SOUNDCLOUD_USER_AGENT: DEFAULT_UA }),
      );
      const match = await client.findMatch(SC_TRACK);
      if (!match) {
        throw new Error(
          "SoundCloud findMatch returned null — real SoundCloud integration is broken",
        );
      }
      const stream = await client.produceStreamUrl(match.sourceLocator);
      // Major-label tracks (Daft Punk / Columbia) may have snippet-only access on
      // SoundCloud free tier. Returning null is correct; returning a preview URL is not.
      if (stream !== null) {
        expect(stream.streamUrl).toMatch(/^https?:\/\//);
        expect(stream.streamUrl).not.toContain("/preview/");
        expect(typeof stream.expiresAt).toBe("string");
      }
    },
    30_000,
  );

  it(
    "produceStreamUrl (HTML-parse path): Please Please Please by Sabrina Carpenter returns a full stream URL without 'preview'",
    async () => {
      const client = new SoundCloudStreamClient(
        fakeConfig({ SOUNDCLOUD_USER_AGENT: DEFAULT_UA }),
      );
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
    },
    40_000,
  );

  it(
    "produceStreamUrl (API fallback path): Don't Stop The Music by Rihanna returns a full stream URL without 'preview', or null when only a snippet is available",
    async () => {
      const client = new SoundCloudStreamClient(
        fakeConfig({ SOUNDCLOUD_USER_AGENT: DEFAULT_UA }),
      );
      const match = await client.findMatch(SC_TRACK_API_PATH);
      if (!match) {
        throw new Error(
          "SoundCloud findMatch returned null for Rihanna — integration is broken",
        );
      }
      expect(match.sourceLocator).toMatch(/^https:\/\/soundcloud\.com\//);
      const stream = await client.produceStreamUrl(match.sourceLocator);
      // Major-label tracks (Rihanna / Def Jam) may have snippet-only access on
      // SoundCloud free tier. Returning null is correct; returning a preview URL is not.
      if (stream !== null) {
        expect(stream.streamUrl).toMatch(/^https?:\/\//);
        expect(stream.streamUrl).not.toContain("/preview/");
      }
    },
    40_000,
  );
});

describe("AudiusStreamClient: real provider (no mocking)", () => {
  it(
    "findMatch returns a non-null result for a track confirmed on Audius",
    async () => {
      const client = new AudiusStreamClient(fakeConfig({ AUDIUS_APP_NAME: "moc-test" }));
      const result = await client.findMatch(AUDIUS_TRACK);
      expect(result).not.toBeNull();
      expect(typeof result?.sourceTrackId).toBe("string");
      expect(result?.sourceTrackId.length).toBeGreaterThan(0);
    },
    20_000,
  );

  it("produceStreamUrl returns a stable Audius stream redirect URL (no network call needed)", () => {
    const client = new AudiusStreamClient(fakeConfig({ AUDIUS_APP_NAME: "moc-test" }));
    const result = client.produceStreamUrl("some-track-id");
    expect(result.streamUrl).toMatch(/^https:\/\/api\.audius\.co\/v1\/tracks\//);
    expect(result.expiresAt).toBeNull();
  });
});
