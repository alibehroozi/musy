// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under PRIVACY-13.

import { describe, it, expect } from "vitest";

describe("PRIVACY-13: context-score writes never reach third parties or LLM prompts", () => {
  async function readSource(rel: string): Promise<string> {
    const fs = await import("node:fs");
    return fs.readFileSync(new URL(rel, import.meta.url), "utf8");
  }

  const SCORING_SOURCES = [
    "../../../apps/api/src/modules/taste/scoring.service.ts",
    "../../../apps/api/src/modules/taste/context-scores.repository.ts",
    "../../../apps/api/src/modules/taste/context-scores.schema.ts",
    "../../../apps/api/src/modules/taste/bucket-song-scores.repository.ts",
    "../../../libs/api/core/src/taste/time-buckets.ts",
    "../../../libs/api/core/src/taste/score-deltas.ts",
    "../../../libs/api/core/src/taste/general-score.ts",
  ] as const;

  it("scoring sources contain no fetch / http(s) URL / node:http(s) import", async () => {
    const sources = await Promise.all(SCORING_SOURCES.map(readSource));
    for (const src of sources) {
      expect(src).not.toMatch(/\bfetch\s*\(/);
      expect(src.toLowerCase()).not.toMatch(/https?:\/\//);
      expect(src).not.toMatch(/from\s+["']node:https?["']/);
      expect(src).not.toMatch(/\brequire\(\s*["']https?["']\s*\)/);
    }
  });

  it("scoring sources contain no Anthropic SDK import", async () => {
    const sources = await Promise.all(SCORING_SOURCES.map(readSource));
    for (const src of sources) {
      expect(src).not.toMatch(/@anthropic-ai\/sdk/);
      expect(src).not.toMatch(/\bAnthropic\b/);
    }
  });
});
