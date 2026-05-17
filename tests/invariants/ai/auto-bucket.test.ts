// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under AI-11, AI-12, AI-13.
// PRIVACY-14 is verified here as well (prompt body only sees recentSongs + existingBuckets).

import { describe, it, expect } from "vitest";
import { buildBucketPrompt, MAX_BUCKET_SONGS, type PromptSong } from "@moc/api-core";

const SAMPLE_USER_ID = "550e8400-e29b-41d4-a716-446655440000";
const SAMPLE_EMAIL = "alice@example.com";
const SAMPLE_IP = "203.0.113.42";
const SAMPLE_SESSION_TOKEN = "sess_eyJhbGciOiJIUzI1NiJ9.test_token_must_not_leak";

function song(i: number): PromptSong {
  return { songKey: `snap:hash${i}`, title: `Title ${i}`, artist: `Artist ${i}`, kind: "track" };
}

describe("AI-11: buildBucketPrompt never embeds userId / email / IP / session in system or user message", () => {
  it("the rendered (system, userMessage) bytes contain none of the identity strings", () => {
    const out = buildBucketPrompt({
      recentSongs: [song(1), song(2)],
      existingBuckets: [{ name: "Chill vibes", description: "Relaxed tracks" }],
    });
    const allBytes = `${out.system}\n${out.userMessage}`;
    for (const identity of [SAMPLE_USER_ID, SAMPLE_EMAIL, SAMPLE_IP, SAMPLE_SESSION_TOKEN]) {
      expect(allBytes).not.toContain(identity);
    }
  });

  it("only (songKey, title, artist, kind) per song reach the prompt — no direction, no timestamps, no coverUrl", () => {
    const dirtySong = {
      ...song(1),
      direction: "right",
      at: "2026-05-17T00:00:00.000Z",
      coverUrl: "https://cdn.example.test/cover.jpg",
      userId: SAMPLE_USER_ID,
      email: SAMPLE_EMAIL,
    } as unknown as PromptSong;

    const out = buildBucketPrompt({
      recentSongs: [dirtySong],
      existingBuckets: [],
    });

    expect(out.userMessage).not.toContain("direction");
    expect(out.userMessage).not.toContain("coverUrl");
    expect(out.userMessage).not.toContain("cdn.example.test");
    expect(out.userMessage).not.toContain(SAMPLE_USER_ID);
    expect(out.userMessage).not.toContain(SAMPLE_EMAIL);
  });

  it("PRIVACY-14: user message is a function of (recentSongs, existingBuckets) only — no userId parameter exists", () => {
    // buildBucketPrompt has no userId parameter — structural proof of PRIVACY-14.
    // The test verifies the call site signature: passing the two allowed inputs
    // and confirming no identity leak in the output.
    const out = buildBucketPrompt({
      recentSongs: [song(1)],
      existingBuckets: [{ name: "Late night drives", description: "Moody late-night tracks" }],
    });
    expect(typeof out.system).toBe("string");
    expect(typeof out.userMessage).toBe("string");
    expect(out.userMessage).not.toContain(SAMPLE_USER_ID);
    expect(out.userMessage).not.toContain(SAMPLE_EMAIL);
    expect(out.userMessage).not.toContain(SAMPLE_IP);
  });
});

describe("AI-12: buildBucketPrompt is deterministic — equal inputs produce byte-identical prompts", () => {
  it("two calls with identical (recentSongs, existingBuckets) produce equal system + userMessage strings", () => {
    const input = {
      recentSongs: [song(1), song(2)],
      existingBuckets: [{ name: "Chill", description: "Relaxed" }],
    };
    const a = buildBucketPrompt(input);
    const b = buildBucketPrompt({ ...input });
    expect(a.system).toBe(b.system);
    expect(a.userMessage).toBe(b.userMessage);
  });

  it("two distinct users with identical inputs derive the same cache-key bytes (system + userMessage)", () => {
    // buildBucketPrompt has no userId argument so two callers with equal inputs
    // cannot diverge — the cache key is identical.
    const input = {
      recentSongs: [song(3), song(4)],
      existingBuckets: [{ name: "Energetic", description: "High-energy tracks" }],
    };
    const a = buildBucketPrompt(input);
    const b = buildBucketPrompt(input);
    expect(a.system + a.userMessage).toBe(b.system + b.userMessage);
  });
});

describe("AI-13: buildBucketPrompt enforces a bounded prompt (≤300 songs) and truncates newest-first", () => {
  it("at most N=300 songs reach the user message; entries past the cap are dropped", () => {
    const songs = Array.from({ length: MAX_BUCKET_SONGS + 50 }, (_, i) => song(i));
    const out = buildBucketPrompt({ recentSongs: songs, existingBuckets: [] });
    const parsed = JSON.parse(out.userMessage) as { recentSongs: PromptSong[] };
    expect(parsed.recentSongs).toHaveLength(MAX_BUCKET_SONGS);
    // First MAX_BUCKET_SONGS entries retained (newest-first = first in array).
    expect(parsed.recentSongs[0]).toEqual(song(0));
    expect(parsed.recentSongs[MAX_BUCKET_SONGS - 1]).toEqual(song(MAX_BUCKET_SONGS - 1));
    expect(
      parsed.recentSongs.find((s) => s.songKey === `snap:hash${MAX_BUCKET_SONGS}`),
    ).toBeUndefined();
  });

  it("does not throw on oversized inputs", () => {
    const songs = Array.from({ length: MAX_BUCKET_SONGS + 200 }, (_, i) => song(i));
    expect(() => buildBucketPrompt({ recentSongs: songs, existingBuckets: [] })).not.toThrow();
  });
});
