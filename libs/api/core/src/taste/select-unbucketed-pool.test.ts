// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under LOGIC-38.

import { describe, it, expect } from "vitest";
import { selectUnbucketedPool, type PromptSong } from "./select-unbucketed-pool.js";

function song(i: number): PromptSong {
  return {
    songKey: `snap:hash${i}`,
    title: `Title ${i}`,
    artist: `Artist ${i}`,
    kind: "track",
  };
}

describe("LOGIC-38: selectUnbucketedPool — newest unbucketed, capped at 20", () => {
  it("returns up to `cap` entries by default (cap = 20)", () => {
    const pool = Array.from({ length: 50 }, (_, i) => song(i));
    const out = selectUnbucketedPool({ pool, scoredSongKeys: new Set() });
    expect(out).toHaveLength(20);
    // Preserves the newest-first order of the input pool.
    expect(out[0]).toEqual(song(0));
    expect(out[19]).toEqual(song(19));
  });

  it("respects an explicit `cap` argument", () => {
    const pool = Array.from({ length: 50 }, (_, i) => song(i));
    const out = selectUnbucketedPool({ pool, scoredSongKeys: new Set(), cap: 5 });
    expect(out).toHaveLength(5);
    expect(out.map((s) => s.songKey)).toEqual([
      "snap:hash0",
      "snap:hash1",
      "snap:hash2",
      "snap:hash3",
      "snap:hash4",
    ]);
  });

  it("filters out entries whose songKey is in scoredSongKeys without counting them toward the cap", () => {
    const pool = Array.from({ length: 30 }, (_, i) => song(i));
    // The 5 newest are already bucketed.
    const scoredSongKeys = new Set([
      "snap:hash0",
      "snap:hash1",
      "snap:hash2",
      "snap:hash3",
      "snap:hash4",
    ]);
    const out = selectUnbucketedPool({ pool, scoredSongKeys });
    expect(out).toHaveLength(20);
    // The cap-of-20 picks up at hash5 (the first unbucketed) and runs through hash24.
    expect(out[0]).toEqual(song(5));
    expect(out[19]).toEqual(song(24));
    for (const s of out) {
      expect(scoredSongKeys.has(s.songKey)).toBe(false);
    }
  });

  it("filters out entries interleaved through the pool", () => {
    const pool = Array.from({ length: 10 }, (_, i) => song(i));
    const scoredSongKeys = new Set(["snap:hash2", "snap:hash5", "snap:hash7"]);
    const out = selectUnbucketedPool({ pool, scoredSongKeys });
    expect(out.map((s) => s.songKey)).toEqual([
      "snap:hash0",
      "snap:hash1",
      "snap:hash3",
      "snap:hash4",
      "snap:hash6",
      "snap:hash8",
      "snap:hash9",
    ]);
  });

  it("returns [] when the pool is empty", () => {
    const out = selectUnbucketedPool({ pool: [], scoredSongKeys: new Set() });
    expect(out).toEqual([]);
  });

  it("returns [] when every pool entry is already in scoredSongKeys", () => {
    const pool = Array.from({ length: 30 }, (_, i) => song(i));
    const scoredSongKeys = new Set(pool.map((s) => s.songKey));
    const out = selectUnbucketedPool({ pool, scoredSongKeys });
    expect(out).toEqual([]);
  });

  it("returns fewer than `cap` entries when filtering leaves fewer eligible songs", () => {
    const pool = Array.from({ length: 25 }, (_, i) => song(i));
    // Mark every entry from hash10 onward as bucketed — only 10 unbucketed remain.
    const scoredSongKeys = new Set(Array.from({ length: 15 }, (_, i) => `snap:hash${i + 10}`));
    const out = selectUnbucketedPool({ pool, scoredSongKeys });
    expect(out).toHaveLength(10);
    expect(out.map((s) => s.songKey)).toEqual(
      Array.from({ length: 10 }, (_, i) => `snap:hash${i}`),
    );
  });

  it("is deterministic — same arguments always produce the same output", () => {
    const pool = Array.from({ length: 10 }, (_, i) => song(i));
    const scoredSongKeys = new Set(["snap:hash3"]);
    const a = selectUnbucketedPool({ pool, scoredSongKeys });
    const b = selectUnbucketedPool({ pool, scoredSongKeys });
    expect(a).toEqual(b);
  });

  it("never mutates its arguments", () => {
    const pool = Array.from({ length: 5 }, (_, i) => song(i));
    const scoredSongKeys = new Set(["snap:hash1"]);
    const poolBefore = JSON.stringify(pool);
    const scoredBefore = [...scoredSongKeys];
    selectUnbucketedPool({ pool, scoredSongKeys, cap: 3 });
    expect(JSON.stringify(pool)).toBe(poolBefore);
    expect([...scoredSongKeys]).toEqual(scoredBefore);
  });
});
