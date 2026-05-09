// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under PRIVACY-03, PRIVACY-04.

import { describe, it, expect } from "vitest";
import { AudiusStreamClient } from "../../../apps/api/src/modules/play/providers/audius-stream.client.js";
import { SoundCloudStreamClient } from "../../../apps/api/src/modules/play/providers/soundcloud-stream.client.js";

describe("PRIVACY-03: Outgoing /play/resolve provider requests carry only snapshot/sourceTrackId, no user identifiers", () => {
  it("AudiusStreamClient.findMatch and produceStreamUrl take exactly one parameter — not a userId", () => {
    expect(AudiusStreamClient.prototype.findMatch.length).toBe(1);
    expect(AudiusStreamClient.prototype.produceStreamUrl.length).toBe(1);
  });

  it("SoundCloudStreamClient.findMatch and produceStreamUrl take exactly one parameter — not a userId", () => {
    expect(SoundCloudStreamClient.prototype.findMatch.length).toBe(1);
    expect(SoundCloudStreamClient.prototype.produceStreamUrl.length).toBe(1);
  });

  it("the play module's source files do not construct any cookie or x-forwarded header on outgoing requests", async () => {
    const fs = await import("node:fs");
    const audiusSource = fs.readFileSync(
      new URL(
        "../../../apps/api/src/modules/play/providers/audius-stream.client.ts",
        import.meta.url,
      ),
      "utf8",
    );
    const soundcloudSource = fs.readFileSync(
      new URL(
        "../../../apps/api/src/modules/play/providers/soundcloud-stream.client.ts",
        import.meta.url,
      ),
      "utf8",
    );

    for (const src of [audiusSource, soundcloudSource]) {
      // Forbidden header names (case-insensitive). Any reach for these on an
      // outgoing request would push user-identifying or session data to the
      // upstream provider, breaking PRIVACY-03.
      expect(src.toLowerCase()).not.toContain("cookie:");
      expect(src.toLowerCase()).not.toContain('"cookie"');
      expect(src.toLowerCase()).not.toContain("x-forwarded-for");
      expect(src.toLowerCase()).not.toContain("authorization:");
      expect(src.toLowerCase()).not.toContain('"authorization"');
    }
  });
});

describe("PRIVACY-04: /play/started and /play/completed make no outgoing third-party HTTP request", () => {
  async function readSource(rel: string): Promise<string> {
    const fs = await import("node:fs");
    return fs.readFileSync(new URL(rel, import.meta.url), "utf8");
  }

  it("the play module's listening-events repository source contains no fetch / http(s) call", async () => {
    const src = await readSource(
      "../../../apps/api/src/modules/play/listening-events.repository.ts",
    );
    expect(src).not.toMatch(/\bfetch\s*\(/);
    expect(src.toLowerCase()).not.toMatch(/https?:\/\//);
    expect(src).not.toMatch(/\brequire\(\s*["']https?["']\s*\)/);
    expect(src).not.toMatch(/from\s+["']node:https?["']/);
  });

  it("the play module's play-events service / controller sources contain no fetch / http(s) call", async () => {
    const sources = await Promise.all([
      readSource("../../../apps/api/src/modules/play/play-events.service.ts"),
      readSource("../../../apps/api/src/modules/play/play-events.controller.ts"),
    ]);
    for (const src of sources) {
      expect(src).not.toMatch(/\bfetch\s*\(/);
      expect(src.toLowerCase()).not.toMatch(/https?:\/\//);
      expect(src).not.toMatch(/from\s+["']node:https?["']/);
    }
  });
});
