// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under PRIVACY-12.

import { describe, it, expect } from "vitest";

describe("PRIVACY-12: GET /api/me/taste/profile makes no outgoing third-party HTTP request and no LLM call", () => {
  async function readSource(rel: string): Promise<string> {
    const fs = await import("node:fs");
    return fs.readFileSync(new URL(rel, import.meta.url), "utf8");
  }

  const TASTE_SOURCES = [
    "../../../apps/api/src/modules/taste/taste.controller.ts",
    "../../../apps/api/src/modules/taste/taste.service.ts",
    "../../../apps/api/src/modules/taste/taste.module.ts",
    "../../../apps/api/src/modules/taste/buckets.repository.ts",
    "../../../apps/api/src/modules/taste/buckets.schema.ts",
    "../../../apps/api/src/modules/taste/bucket-song-scores.repository.ts",
    "../../../apps/api/src/modules/taste/bucket-song-scores.schema.ts",
  ] as const;

  it("the taste module's controller, service, and repositories contain no fetch / http(s) / node:http(s) import", async () => {
    const sources = await Promise.all(TASTE_SOURCES.map(readSource));
    for (const src of sources) {
      expect(src).not.toMatch(/\bfetch\s*\(/);
      expect(src.toLowerCase()).not.toMatch(/https?:\/\//);
      expect(src).not.toMatch(/from\s+["']node:https?["']/);
      expect(src).not.toMatch(/\brequire\(\s*["']https?["']\s*\)/);
    }
  });

  it("the taste module's sources contain no Anthropic SDK import", async () => {
    const sources = await Promise.all(TASTE_SOURCES.map(readSource));
    for (const src of sources) {
      expect(src).not.toMatch(/@anthropic-ai\/sdk/);
      expect(src).not.toMatch(/\bAnthropic\b/);
    }
  });
});
