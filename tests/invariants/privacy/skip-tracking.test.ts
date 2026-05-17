// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under PRIVACY-15.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("PRIVACY-15: skip detector makes no outgoing HTTP or LLM calls", () => {
  it("play-events.service.ts contains no fetch() invocation", () => {
    const src = readFileSync(
      resolve(import.meta.dirname, "../../../apps/api/src/modules/play/play-events.service.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/\bfetch\s*\(/);
  });

  it("play-events.service.ts contains no http(s):// URL", () => {
    const src = readFileSync(
      resolve(import.meta.dirname, "../../../apps/api/src/modules/play/play-events.service.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/https?:\/\//);
  });

  it("play-events.service.ts does not import node:http or node:https", () => {
    const src = readFileSync(
      resolve(import.meta.dirname, "../../../apps/api/src/modules/play/play-events.service.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/from ['"]node:https?['"]/);
  });

  it("play-events.service.ts does not import the Anthropic SDK", () => {
    const src = readFileSync(
      resolve(import.meta.dirname, "../../../apps/api/src/modules/play/play-events.service.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/@anthropic-ai\/sdk|from ['"]@anthropic-ai/);
  });
});
