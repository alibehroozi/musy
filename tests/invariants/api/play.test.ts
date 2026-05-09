// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under API-08, API-09.

import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import { ErrorResponse, ResolveResponse } from "@moc/contracts";
import {
  buildPlayTestApp,
  makeSnapshot,
  type PlayTestAppHandle,
} from "../_helpers/play-test-app.js";

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
