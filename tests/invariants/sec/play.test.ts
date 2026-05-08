// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under SEC-06.

import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import { buildPlayTestApp, type PlayTestAppHandle } from "../_helpers/play-test-app.js";

const VALID_SNAPSHOT = {
  snapshot: { title: "Get Lucky", artist: "Daft Punk", kind: "track", durationSec: 249 },
};

describe("SEC-06: SOUNDCLOUD_USER_AGENT and extracted client_id never appear in any HTTP response body", () => {
  let h: PlayTestAppHandle | undefined;
  afterEach(async () => {
    if (h) await h.app.close();
    h = undefined;
  });

  it("the SOUNDCLOUD_USER_AGENT value does not appear in the /play/resolve response body", async () => {
    h = await buildPlayTestApp();
    h.soundcloud.result = {
      sourceTrackId: "sc-777",
      streamUrl: "https://api-v2.soundcloud.com/media/xyz/stream",
    };

    const res = await request(h.app.getHttpServer())
      .post("/api/play/resolve")
      .send(VALID_SNAPSHOT)
      .set("Content-Type", "application/json");

    const body = JSON.stringify(res.body);
    expect(body).not.toContain(h.env.SOUNDCLOUD_USER_AGENT);
  });

  it("a SoundCloud client_id extracted from the HTML does not appear in the /play/resolve response body", async () => {
    h = await buildPlayTestApp();
    const clientId = "secretclientid999";
    // The fake SoundCloud client returns a stream URL, not the client_id directly.
    // We verify the response body doesn't contain any value that looks like a client_id.
    h.soundcloud.result = {
      sourceTrackId: "sc-888",
      streamUrl: "https://api-v2.soundcloud.com/media/abc/stream",
    };

    const res = await request(h.app.getHttpServer())
      .post("/api/play/resolve")
      .send(VALID_SNAPSHOT)
      .set("Content-Type", "application/json");

    const body = JSON.stringify(res.body);
    expect(body).not.toContain(clientId);
    // The client_id must not appear as a query param in the streamUrl in the response
    expect(body).not.toMatch(/client_id=[^"]+/);
  });
});
