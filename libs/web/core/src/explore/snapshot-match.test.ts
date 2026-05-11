import { describe, it, expect } from "vitest";
import type { SongSnapshot } from "@moc/contracts";
import { snapshotsMatch } from "./snapshot-match.js";

const BASE: SongSnapshot = {
  title: "Get Lucky",
  artist: "Daft Punk",
  durationSec: 369,
  kind: "track",
};

describe("snapshotsMatch", () => {
  it("returns true for identical snapshots", () => {
    expect(snapshotsMatch(BASE, { ...BASE })).toBe(true);
  });

  it("ignores leading/trailing whitespace in title and artist", () => {
    expect(snapshotsMatch(BASE, { ...BASE, title: "  Get Lucky  " })).toBe(true);
    expect(snapshotsMatch(BASE, { ...BASE, artist: "Daft Punk\n" })).toBe(true);
  });

  it("ignores ASCII case in title and artist", () => {
    expect(snapshotsMatch(BASE, { ...BASE, title: "GET LUCKY" })).toBe(true);
    expect(snapshotsMatch(BASE, { ...BASE, artist: "daft punk" })).toBe(true);
  });

  it("treats different durationSec as a mismatch", () => {
    expect(snapshotsMatch(BASE, { ...BASE, durationSec: 370 })).toBe(false);
  });

  it("missing durationSec on both sides matches", () => {
    const a: SongSnapshot = { title: "T", artist: "A", kind: "track" };
    const b: SongSnapshot = { title: "T", artist: "A", kind: "track" };
    expect(snapshotsMatch(a, b)).toBe(true);
  });

  it("returns false when one side is null", () => {
    expect(snapshotsMatch(null, BASE)).toBe(false);
    expect(snapshotsMatch(BASE, null)).toBe(false);
    expect(snapshotsMatch(null, null)).toBe(false);
  });
});
