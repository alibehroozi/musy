// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under LOGIC-38.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import * as apiCore from "@moc/api-core";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "../../../..");
const API_SRC = join(REPO_ROOT, "apps", "api", "src");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) {
      out.push(...walk(p));
    } else if (p.endsWith(".ts")) {
      out.push(p);
    }
  }
  return out;
}

describe("LOGIC-38: SWIPE_TRIGGER_THRESHOLD is hosted in @moc/api-core", () => {
  it("@moc/api-core exports SWIPE_TRIGGER_THRESHOLD equal to 20", () => {
    const exported = (apiCore as Record<string, unknown>).SWIPE_TRIGGER_THRESHOLD;
    expect(exported).toBe(20);
  });

  it("no file under apps/api/src declares its own SWIPE_TRIGGER_THRESHOLD constant", () => {
    const offenders: string[] = [];
    const pattern = /\b(export\s+)?const\s+SWIPE_TRIGGER_THRESHOLD\b/;
    for (const file of walk(API_SRC)) {
      const text = readFileSync(file, "utf8");
      if (pattern.test(text)) {
        offenders.push(file.slice(REPO_ROOT.length + 1));
      }
    }
    expect(offenders).toEqual([]);
  });
});
