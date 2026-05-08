// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under PRIVACY-03.

import { describe, it, expect } from "vitest";
import { AudiusStreamClient } from "../../../apps/api/src/modules/play/providers/audius-stream.client.js";
import { SoundCloudStreamClient } from "../../../apps/api/src/modules/play/providers/soundcloud-stream.client.js";

describe("PRIVACY-03: Outgoing requests to Audius and SoundCloud carry only song-snapshot data; no user identifier or session cookie", () => {
  it("Audius search requests contain only the title+artist query; no session/user headers", async () => {
    const capturedRequests: { url: string; headers: Record<string, string> }[] = [];
    const originalFetch = global.fetch;

    global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      capturedRequests.push({
        url,
        headers: Object.fromEntries(Object.entries(init?.headers ?? {})),
      });
      return new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    try {
      const mockConfig = { get: (_key: string, defaultVal?: unknown) => defaultVal } as never;
      const client = new AudiusStreamClient(mockConfig);
      await client.resolveTrackId({ title: "Get Lucky", artist: "Daft Punk" });

      expect(capturedRequests.length).toBeGreaterThan(0);
      const req = capturedRequests[0]!;

      // Only the search query is sent — no user id, session cookie, or forwarding headers
      expect(req.headers["cookie"]).toBeUndefined();
      expect(req.headers["x-user-id"]).toBeUndefined();
      expect(req.headers["x-forwarded-for"]).toBeUndefined();
      expect(req.headers["authorization"]).toBeUndefined();
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("SoundCloud page-fetch requests contain only the spoofed User-Agent; no session/user headers", async () => {
    const capturedRequests: { url: string; headers: Record<string, string> }[] = [];
    const originalFetch = global.fetch;

    global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const headers = Object.fromEntries(
        Object.entries(init?.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]),
      );
      capturedRequests.push({ url, headers });
      return new Response("<html></html>", {
        status: 200,
        headers: { "Content-Type": "text/html" },
      });
    };

    try {
      const spoofedUA = "test-ua-spoofed";
      const mockConfig = {
        get: (key: string, defaultVal?: unknown) =>
          key === "SOUNDCLOUD_USER_AGENT" ? spoofedUA : defaultVal,
      } as never;
      const client = new SoundCloudStreamClient(mockConfig);
      await client.resolveStreamUrl({ title: "Get Lucky", artist: "Daft Punk" }).catch(() => {});

      expect(capturedRequests.length).toBeGreaterThan(0);
      const req = capturedRequests[0]!;

      expect(req.headers["user-agent"]).toBe(spoofedUA);
      expect(req.headers["cookie"]).toBeUndefined();
      expect(req.headers["x-user-id"]).toBeUndefined();
      expect(req.headers["x-forwarded-for"]).toBeUndefined();
      expect(req.headers["authorization"]).toBeUndefined();
    } finally {
      global.fetch = originalFetch;
    }
  });
});
