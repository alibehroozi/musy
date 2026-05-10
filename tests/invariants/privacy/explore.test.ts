// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under PRIVACY-07.

import { describe, it, expect } from "vitest";

describe("PRIVACY-07: /api/explore/swipe makes no outgoing third-party HTTP request", () => {
  async function readSource(rel: string): Promise<string> {
    const fs = await import("node:fs");
    return fs.readFileSync(new URL(rel, import.meta.url), "utf8");
  }

  it("the explore module's swipes repository source contains no fetch / http(s) call", async () => {
    const src = await readSource("../../../apps/api/src/modules/explore/explore.repository.ts");
    expect(src).not.toMatch(/\bfetch\s*\(/);
    expect(src.toLowerCase()).not.toMatch(/https?:\/\//);
    expect(src).not.toMatch(/\brequire\(\s*["']https?["']\s*\)/);
    expect(src).not.toMatch(/from\s+["']node:https?["']/);
  });

  it("the explore service / controller sources contain no fetch / http(s) call", async () => {
    const sources = await Promise.all([
      readSource("../../../apps/api/src/modules/explore/explore.service.ts"),
      readSource("../../../apps/api/src/modules/explore/explore.controller.ts"),
    ]);
    for (const src of sources) {
      expect(src).not.toMatch(/\bfetch\s*\(/);
      expect(src.toLowerCase()).not.toMatch(/https?:\/\//);
      expect(src).not.toMatch(/from\s+["']node:https?["']/);
    }
  });
});
