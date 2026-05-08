// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under API-07, API-08.

import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import { ErrorResponse, ResolveResponse } from "@moc/contracts";
import { buildPlayTestApp, type PlayTestAppHandle } from "../_helpers/play-test-app.js";

const VALID_SNAPSHOT = {
  snapshot: { title: "Get Lucky", artist: "Daft Punk", kind: "track", durationSec: 249 },
};

describe("API-07: POST /play/resolve is public; returns 400 on bad snapshot; returns 200 source:null when no provider matches", () => {
  let h: PlayTestAppHandle | undefined;
  afterEach(async () => {
    if (h) await h.app.close();
    h = undefined;
  });

  it("returns non-401 without a session cookie", async () => {
    h = await buildPlayTestApp();
    const res = await request(h.app.getHttpServer())
      .post("/api/play/resolve")
      .send(VALID_SNAPSHOT)
      .set("Content-Type", "application/json");
    expect(res.status).not.toBe(401);
  });

  it("returns 400 + ErrorResponse when snapshot is missing from body", async () => {
    h = await buildPlayTestApp();
    const res = await request(h.app.getHttpServer())
      .post("/api/play/resolve")
      .send({})
      .set("Content-Type", "application/json");
    expect(res.status).toBe(400);
    expect(() => ErrorResponse.parse(res.body)).not.toThrow();
  });

  it("returns 400 + ErrorResponse when snapshot.title is missing", async () => {
    h = await buildPlayTestApp();
    const res = await request(h.app.getHttpServer())
      .post("/api/play/resolve")
      .send({ snapshot: { artist: "Daft Punk", kind: "track" } })
      .set("Content-Type", "application/json");
    expect(res.status).toBe(400);
    expect(() => ErrorResponse.parse(res.body)).not.toThrow();
  });

  it("returns 200 with source:null and streamUrl:null when no provider matches", async () => {
    h = await buildPlayTestApp();
    h.audius.shouldFail = false;
    h.audius.resolvedTrackId = null;
    h.soundcloud.shouldFail = false;
    h.soundcloud.result = null;

    const res = await request(h.app.getHttpServer())
      .post("/api/play/resolve")
      .send(VALID_SNAPSHOT)
      .set("Content-Type", "application/json");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ source: null, streamUrl: null });
  });
});

describe("API-08: POST /play/resolve response always conforms to ResolveResponse Zod schema", () => {
  let h: PlayTestAppHandle | undefined;
  afterEach(async () => {
    if (h) await h.app.close();
    h = undefined;
  });

  it("response matches ResolveResponse schema when Audius returns a match", async () => {
    h = await buildPlayTestApp();
    h.audius.resolvedTrackId = "abc123";

    const res = await request(h.app.getHttpServer())
      .post("/api/play/resolve")
      .send(VALID_SNAPSHOT)
      .set("Content-Type", "application/json");
    expect(res.status).toBe(200);
    expect(() => ResolveResponse.parse(res.body)).not.toThrow();
    const body = ResolveResponse.parse(res.body);
    expect(body.source).toBe("audius");
    expect(body.streamUrl).toBeTruthy();
  });

  it("response matches ResolveResponse schema when both providers fail", async () => {
    h = await buildPlayTestApp();
    h.audius.shouldFail = true;
    h.soundcloud.shouldFail = true;

    const res = await request(h.app.getHttpServer())
      .post("/api/play/resolve")
      .send(VALID_SNAPSHOT)
      .set("Content-Type", "application/json");
    expect(res.status).toBe(200);
    expect(() => ResolveResponse.parse(res.body)).not.toThrow();
    const body = ResolveResponse.parse(res.body);
    expect(body.source).toBeNull();
    expect(body.streamUrl).toBeNull();
  });

  it("response matches ResolveResponse schema when SoundCloud is the fallback", async () => {
    h = await buildPlayTestApp();
    h.audius.resolvedTrackId = null;
    h.soundcloud.result = {
      sourceTrackId: "sc-track-999",
      streamUrl: "https://api-v2.soundcloud.com/media/abc/stream",
    };

    const res = await request(h.app.getHttpServer())
      .post("/api/play/resolve")
      .send(VALID_SNAPSHOT)
      .set("Content-Type", "application/json");
    expect(res.status).toBe(200);
    expect(() => ResolveResponse.parse(res.body)).not.toThrow();
    const body = ResolveResponse.parse(res.body);
    expect(body.source).toBe("soundcloud");
    expect(body.streamUrl).toBeTruthy();
  });
});
