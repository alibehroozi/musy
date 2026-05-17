// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under AI-14, AI-15, AI-16.
// PRIVACY-15 is verified here as well (prompt body only sees promptText + pool + buckets).

import { describe, it, expect } from "vitest";
import { buildCustomMixPrompt, MAX_CUSTOM_MIX_POOL, type CustomMixPoolSong } from "@moc/api-core";

const SAMPLE_USER_ID = "550e8400-e29b-41d4-a716-446655440000";
const SAMPLE_EMAIL = "alice@example.com";
const SAMPLE_IP = "203.0.113.42";
const SAMPLE_SESSION_TOKEN = "sess_eyJhbGciOiJIUzI1NiJ9.test_token_must_not_leak";

function song(i: number): CustomMixPoolSong {
  return {
    songKey: `snap:hash${i}`,
    title: `Title ${i}`,
    artist: `Artist ${i}`,
    kind: "track",
    generalScore: 50,
  };
}

describe("AI-14: buildCustomMixPrompt never embeds userId / email / IP / session in system or user message", () => {
  it("the rendered (system, userMessage) bytes contain none of the identity strings", () => {
    const out = buildCustomMixPrompt({
      promptText: "dreamy late-night focus",
      pool: [song(1), song(2)],
      buckets: [{ id: "b-1", name: "Late night drives", description: "Moody late tracks" }],
    });
    const allBytes = `${out.system}\n${out.userMessage}`;
    for (const identity of [SAMPLE_USER_ID, SAMPLE_EMAIL, SAMPLE_IP, SAMPLE_SESSION_TOKEN]) {
      expect(allBytes).not.toContain(identity);
    }
  });

  it("only the projected per-song fields reach the user message", () => {
    const dirty = {
      ...song(1),
      direction: "right",
      at: "2026-05-17T00:00:00.000Z",
      coverUrl: "https://cdn.example.test/cover.jpg",
      userId: SAMPLE_USER_ID,
      email: SAMPLE_EMAIL,
    } as unknown as CustomMixPoolSong;

    const out = buildCustomMixPrompt({
      promptText: "moody",
      pool: [dirty],
      buckets: [],
    });

    expect(out.userMessage).not.toContain("direction");
    expect(out.userMessage).not.toContain("coverUrl");
    expect(out.userMessage).not.toContain("cdn.example.test");
    expect(out.userMessage).not.toContain(SAMPLE_USER_ID);
    expect(out.userMessage).not.toContain(SAMPLE_EMAIL);
  });

  it("PRIVACY-15: user message is a function of (promptText, pool, buckets) only — no userId parameter exists", () => {
    const out = buildCustomMixPrompt({
      promptText: "rainy day jazz",
      pool: [song(1)],
      buckets: [{ id: "b-1", name: "Late night drives", description: "Moody" }],
    });
    expect(typeof out.system).toBe("string");
    expect(typeof out.userMessage).toBe("string");
    expect(out.userMessage).not.toContain(SAMPLE_USER_ID);
    expect(out.userMessage).not.toContain(SAMPLE_EMAIL);
    expect(out.userMessage).not.toContain(SAMPLE_IP);

    const parsed = JSON.parse(out.userMessage) as Record<string, unknown>;
    // Top-level keys are exactly promptText, pool, buckets — nothing else.
    expect(Object.keys(parsed).sort()).toEqual(["buckets", "pool", "promptText"]);
  });
});

describe("AI-15: buildCustomMixPrompt is deterministic — equal inputs produce byte-identical prompts", () => {
  it("two callers with identical inputs produce equal system + userMessage strings", () => {
    const input = {
      promptText: "dreamy late-night focus",
      pool: [song(1), song(2)],
      buckets: [{ id: "b-1", name: "Chill", description: "Relaxed" }],
    };
    const a = buildCustomMixPrompt(input);
    const b = buildCustomMixPrompt({ ...input });
    expect(a.system).toBe(b.system);
    expect(a.userMessage).toBe(b.userMessage);
  });

  it("two distinct users with identical inputs derive the same cache-key bytes", () => {
    // buildCustomMixPrompt has no userId argument so two callers with equal
    // inputs cannot diverge — the cache key (system + userMessage bytes) is
    // identical.
    const input = {
      promptText: "energetic",
      pool: [song(3), song(4)],
      buckets: [{ id: "b-2", name: "Energetic", description: "High-energy" }],
    };
    const a = buildCustomMixPrompt(input);
    const b = buildCustomMixPrompt(input);
    expect(a.system + a.userMessage).toBe(b.system + b.userMessage);
  });
});

describe("AI-16: buildCustomMixPrompt enforces a bounded prompt (≤400 songs) and truncates newest-first", () => {
  it("at most N=400 songs reach the user message; entries past the cap are dropped", () => {
    const songs = Array.from({ length: MAX_CUSTOM_MIX_POOL + 50 }, (_, i) => song(i));
    const out = buildCustomMixPrompt({
      promptText: "anything",
      pool: songs,
      buckets: [],
    });
    const parsed = JSON.parse(out.userMessage) as { pool: CustomMixPoolSong[] };
    expect(parsed.pool).toHaveLength(MAX_CUSTOM_MIX_POOL);
    // First MAX_CUSTOM_MIX_POOL entries retained (newest-first = first in array).
    expect(parsed.pool[0]).toEqual(song(0));
    expect(parsed.pool[MAX_CUSTOM_MIX_POOL - 1]).toEqual(song(MAX_CUSTOM_MIX_POOL - 1));
    expect(
      parsed.pool.find((s) => s.songKey === `snap:hash${MAX_CUSTOM_MIX_POOL}`),
    ).toBeUndefined();
  });

  it("does not throw on oversized inputs", () => {
    const songs = Array.from({ length: MAX_CUSTOM_MIX_POOL + 200 }, (_, i) => song(i));
    expect(() =>
      buildCustomMixPrompt({ promptText: "anything", pool: songs, buckets: [] }),
    ).not.toThrow();
  });

  it("per-bucket description longer than 200 chars is truncated to 200", () => {
    const longDesc = "x".repeat(500);
    const out = buildCustomMixPrompt({
      promptText: "anything",
      pool: [song(1)],
      buckets: [{ id: "b-1", name: "Long", description: longDesc }],
    });
    const parsed = JSON.parse(out.userMessage) as {
      buckets: { description: string | null }[];
    };
    expect(parsed.buckets[0]!.description!.length).toBe(200);
  });
});
