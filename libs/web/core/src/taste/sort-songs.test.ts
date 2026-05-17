// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under LOGIC-39.

import { describe, it, expect } from "vitest";
import type { BucketDetailSong } from "@moc/contracts";
import { sortByScoreDesc } from "./sort-songs.js";

function song(
  songKey: string,
  score: number,
  lastUpdatedAt: string,
  title = "T",
): BucketDetailSong {
  return {
    songKey,
    score,
    lastUpdatedAt,
    snapshot: { title, artist: "A", kind: "track" },
  };
}

describe("LOGIC-39: sortByScoreDesc — score desc, lastUpdatedAt desc tie-break", () => {
  it("returns [] for empty input", () => {
    expect(sortByScoreDesc([])).toEqual([]);
  });

  it("sorts by score descending", () => {
    const rows = [
      song("a:1", 40, "2026-01-01T00:00:00.000Z"),
      song("a:2", 80, "2026-01-01T00:00:00.000Z"),
      song("a:3", 60, "2026-01-01T00:00:00.000Z"),
    ];
    const result = sortByScoreDesc(rows);
    expect(result.map((r) => r.score)).toEqual([80, 60, 40]);
  });

  it("breaks ties by lastUpdatedAt descending (newer first)", () => {
    const rows = [
      song("a:1", 50, "2026-01-01T00:00:00.000Z"),
      song("a:2", 50, "2026-03-01T00:00:00.000Z"),
      song("a:3", 50, "2026-02-01T00:00:00.000Z"),
    ];
    const result = sortByScoreDesc(rows);
    expect(result.map((r) => r.songKey)).toEqual(["a:2", "a:3", "a:1"]);
  });

  it("does not mutate the input array", () => {
    const rows = [
      song("a:1", 30, "2026-01-01T00:00:00.000Z"),
      song("a:2", 90, "2026-01-01T00:00:00.000Z"),
    ];
    const copy = [...rows];
    sortByScoreDesc(rows);
    expect(rows).toEqual(copy);
  });

  it("handles a single element", () => {
    const rows = [song("a:1", 55, "2026-05-01T00:00:00.000Z")];
    expect(sortByScoreDesc(rows)).toEqual(rows);
  });

  it("primary sort is score; secondary is timestamp — mixed scenario", () => {
    const rows = [
      song("a:old", 70, "2025-01-01T00:00:00.000Z"),
      song("b:new", 70, "2026-01-01T00:00:00.000Z"),
      song("c:mid", 85, "2024-01-01T00:00:00.000Z"),
      song("d:low", 10, "2027-01-01T00:00:00.000Z"),
    ];
    const result = sortByScoreDesc(rows);
    expect(result.map((r) => r.songKey)).toEqual(["c:mid", "b:new", "a:old", "d:low"]);
  });
});
