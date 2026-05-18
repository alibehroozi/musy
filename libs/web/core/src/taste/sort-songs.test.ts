// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under LOGIC-40.

import { describe, it, expect } from "vitest";
import { sortBySCoreDesc, type SortableSongRow } from "./sort-songs.js";

function row(songKey: string, score: number, lastUpdatedAt: string): SortableSongRow {
  return {
    songKey,
    snapshot: { title: songKey, artist: "x", kind: "track" },
    score,
    lastUpdatedAt,
  };
}

describe("LOGIC-40: sortBySCoreDesc sorts by score desc, lastUpdatedAt desc, then songKey asc", () => {
  it("returns [] for empty input", () => {
    expect(sortBySCoreDesc([])).toEqual([]);
  });

  it("sorts by score descending", () => {
    const out = sortBySCoreDesc([
      row("a", 10, "2026-05-01T00:00:00.000Z"),
      row("b", 80, "2026-05-01T00:00:00.000Z"),
      row("c", 40, "2026-05-01T00:00:00.000Z"),
    ]);
    expect(out.map((r) => r.songKey)).toEqual(["b", "c", "a"]);
  });

  it("breaks score ties by lastUpdatedAt descending (more recent first)", () => {
    const out = sortBySCoreDesc([
      row("older", 50, "2026-04-01T00:00:00.000Z"),
      row("newer", 50, "2026-05-01T00:00:00.000Z"),
    ]);
    expect(out.map((r) => r.songKey)).toEqual(["newer", "older"]);
  });

  it("breaks residual ties (same score AND lastUpdatedAt) by songKey ascending", () => {
    const out = sortBySCoreDesc([
      row("zeta", 50, "2026-05-01T00:00:00.000Z"),
      row("alpha", 50, "2026-05-01T00:00:00.000Z"),
      row("mike", 50, "2026-05-01T00:00:00.000Z"),
    ]);
    expect(out.map((r) => r.songKey)).toEqual(["alpha", "mike", "zeta"]);
  });

  it("does not mutate its input array", () => {
    const input = [
      row("a", 10, "2026-05-01T00:00:00.000Z"),
      row("b", 90, "2026-05-01T00:00:00.000Z"),
    ];
    const before = input.map((r) => r.songKey).join(",");
    sortBySCoreDesc(input);
    const after = input.map((r) => r.songKey).join(",");
    expect(after).toBe(before);
  });

  it("is deterministic — calling twice produces identical orderings", () => {
    const input = [
      row("a", 30, "2026-05-01T00:00:00.000Z"),
      row("b", 30, "2026-05-01T00:00:00.000Z"),
      row("c", 30, "2026-05-01T00:00:00.000Z"),
    ];
    expect(sortBySCoreDesc(input).map((r) => r.songKey)).toEqual(
      sortBySCoreDesc(input).map((r) => r.songKey),
    );
  });

  it("combines all three keys correctly", () => {
    const out = sortBySCoreDesc([
      row("low", 10, "2026-06-01T00:00:00.000Z"),
      row("hi-old-z", 90, "2026-04-01T00:00:00.000Z"),
      row("hi-new-b", 90, "2026-05-01T00:00:00.000Z"),
      row("hi-new-a", 90, "2026-05-01T00:00:00.000Z"),
    ]);
    // Score wins first: all three 90s lead.
    // Within 90s: 2026-05-01 (newer) precedes 2026-04-01 (older).
    // Within the 2026-05-01 pair: songKey ascending → a then b.
    expect(out.map((r) => r.songKey)).toEqual(["hi-new-a", "hi-new-b", "hi-old-z", "low"]);
  });
});
