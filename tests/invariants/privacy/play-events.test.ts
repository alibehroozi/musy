// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under PRIVACY-04.

import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import { buildPlayTestApp, type PlayTestAppHandle } from "../_helpers/play-test-app.js";

const VALID_SNAPSHOT = { title: "Get Lucky", artist: "Daft Punk", kind: "track", durationSec: 249 };

describe("PRIVACY-04: POST /play/started and POST /play/completed make no outgoing third-party HTTP requests; listening data stays within database tier", () => {
  let h: PlayTestAppHandle | undefined;
  afterEach(async () => {
    if (h) await h.app.close();
    h = undefined;
  });

  it("POST /play/started does not make any outgoing fetch calls", async () => {
    h = await buildPlayTestApp();
    const outgoingUrls: string[] = [];
    const originalFetch = global.fetch;
    global.fetch = async (input: RequestInfo | URL) => {
      outgoingUrls.push(typeof input === "string" ? input : input.toString());
      return new Response("{}", { status: 200 });
    };

    try {
      const token = h.authService.signSession({ uid: "user-1", gid: "g-1" });
      await request(h.app.getHttpServer())
        .post("/api/play/started")
        .send({ source: "audius", externalId: "track-abc", snapshot: VALID_SNAPSHOT })
        .set("Content-Type", "application/json")
        .set("Cookie", `session=${token}`);

      expect(outgoingUrls).toHaveLength(0);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("POST /play/completed does not make any outgoing fetch calls", async () => {
    h = await buildPlayTestApp();
    const outgoingUrls: string[] = [];
    const originalFetch = global.fetch;
    global.fetch = async (input: RequestInfo | URL) => {
      outgoingUrls.push(typeof input === "string" ? input : input.toString());
      return new Response("{}", { status: 200 });
    };

    try {
      const token = h.authService.signSession({ uid: "user-1", gid: "g-1" });
      await request(h.app.getHttpServer())
        .post("/api/play/completed")
        .send({
          source: "audius",
          externalId: "track-abc",
          snapshot: VALID_SNAPSHOT,
          elapsedMs: 60000,
        })
        .set("Content-Type", "application/json")
        .set("Cookie", `session=${token}`);

      expect(outgoingUrls).toHaveLength(0);
    } finally {
      global.fetch = originalFetch;
    }
  });
});
