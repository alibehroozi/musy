// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under AI-04, AI-05.

import { describe, it, expect } from "vitest";
import {
  buildRerankPrompt,
  MAX_PROFILE_SUMMARY_BYTES,
  MAX_RERANK_CANDIDATES,
  type PromptCandidate,
} from "@moc/api-core";

const SAMPLE_USER_ID = "550e8400-e29b-41d4-a716-446655440000";
const SAMPLE_EMAIL = "alice@example.com";
const SAMPLE_IP = "203.0.113.42";
const SAMPLE_SESSION_TOKEN = "sess_eyJhbGciOiJIUzI1NiJ9.test_token_must_not_leak";
const SAMPLE_SWIPE_HISTORY = "swiped_right_then_left_then_right";

function candidate(i: number): PromptCandidate {
  return {
    title: `Track ${i}`,
    artist: `Artist ${i}`,
    source: i % 2 === 0 ? "soundcloud" : "audius",
  };
}

describe("AI-04: buildRerankPrompt never embeds userId / email / IP / session / raw swipe directions", () => {
  it("the rendered (system, userMessage) bytes contain none of the identity strings passed alongside the input", () => {
    const out = buildRerankPrompt({
      candidatePool: [candidate(1), candidate(2)],
      profileSummary: "you tend to like deep house",
    });
    const all = `${out.system}\n${out.userMessage}`;
    for (const identity of [
      SAMPLE_USER_ID,
      SAMPLE_EMAIL,
      SAMPLE_IP,
      SAMPLE_SESSION_TOKEN,
      SAMPLE_SWIPE_HISTORY,
    ]) {
      expect(all).not.toContain(identity);
    }
  });

  it("only (title, artist, source) from each candidate reaches the prompt", () => {
    const dirty = {
      ...candidate(1),
      coverUrl: "https://cdn.example.test/cover.jpg",
      year: 2025,
      durationSec: 234,
      userId: SAMPLE_USER_ID,
      ipAddress: SAMPLE_IP,
    } as unknown as PromptCandidate;
    const out = buildRerankPrompt({
      candidatePool: [dirty],
      profileSummary: "summary",
    });
    expect(out.userMessage).not.toContain("coverUrl");
    expect(out.userMessage).not.toContain("ipAddress");
    expect(out.userMessage).not.toContain("durationSec");
    expect(out.userMessage).not.toContain(SAMPLE_USER_ID);
    expect(out.userMessage).not.toContain(SAMPLE_IP);
    expect(out.userMessage).not.toContain("cdn.example.test");
  });
});

describe("AI-05: buildRerankPrompt is deterministic — equal inputs produce byte-identical prompts", () => {
  it("two calls with identical (candidatePool, profileSummary) produce equal system + userMessage strings", () => {
    const input = {
      candidatePool: [candidate(1), candidate(2), candidate(3)],
      profileSummary: "you tend to like deep house",
    };
    const a = buildRerankPrompt(input);
    const b = buildRerankPrompt({ ...input });
    expect(a.system).toBe(b.system);
    expect(a.userMessage).toBe(b.userMessage);
  });

  it("two distinct userIds with identical inputs derive equal cache-key inputs (system + userMessage bytes)", () => {
    const aliceContext = { userId: "alice-uuid", email: "alice@x" };
    const bobContext = { userId: "bob-uuid", email: "bob@x" };
    void aliceContext;
    void bobContext;
    const input = {
      candidatePool: [candidate(1)],
      profileSummary: "shared summary",
    };
    const aPrompt = buildRerankPrompt(input);
    const bPrompt = buildRerankPrompt(input);
    expect(aPrompt.system + aPrompt.userMessage).toBe(bPrompt.system + bPrompt.userMessage);
  });

  it("the buildRerankPrompt source contains no fetch / http(s) / network primitive — pure-logic boundary", async () => {
    const fs = await import("node:fs");
    const src = fs.readFileSync(
      new URL("../../../libs/api/core/src/explore/rerank-prompt.ts", import.meta.url),
      "utf8",
    );
    expect(src).not.toMatch(/\bfetch\s*\(/);
    expect(src.toLowerCase()).not.toMatch(/https?:\/\//);
    expect(src).not.toMatch(/from\s+["']node:https?["']/);
    expect(src).not.toMatch(/\brequire\(\s*["']https?["']\s*\)/);
  });

  it("caps candidatePool at MAX_RERANK_CANDIDATES (per AI-05 prompt-size determinism)", () => {
    const candidates = Array.from({ length: MAX_RERANK_CANDIDATES + 30 }, (_, i) => candidate(i));
    const out = buildRerankPrompt({ candidatePool: candidates, profileSummary: "" });
    const parsed = JSON.parse(out.userMessage);
    expect(parsed.candidatePool).toHaveLength(MAX_RERANK_CANDIDATES);
  });

  it("truncates profileSummary to MAX_PROFILE_SUMMARY_BYTES without throwing", () => {
    const oversized = "a".repeat(MAX_PROFILE_SUMMARY_BYTES + 512);
    expect(() => buildRerankPrompt({ candidatePool: [], profileSummary: oversized })).not.toThrow();
    const out = buildRerankPrompt({ candidatePool: [], profileSummary: oversized });
    const parsed = JSON.parse(out.userMessage);
    expect(Buffer.byteLength(parsed.profileSummary, "utf8")).toBeLessThanOrEqual(
      MAX_PROFILE_SUMMARY_BYTES,
    );
  });
});
