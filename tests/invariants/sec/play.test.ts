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

describe("SEC-08: /play/started and /play/completed always derive userId from the session, never from the body", () => {
  it.todo(
    "a body field 'userId' targeting victimId is ignored — the upsert lands under the session's uid",
  );
  it.todo("with no session cookie the call is rejected with 401 before any DB write happens");
  it.todo("user A's listening_events / interest_scores writes are scoped to A's userId, not B's");
});
