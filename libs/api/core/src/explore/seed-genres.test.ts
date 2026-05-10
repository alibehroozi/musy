import { describe, it, expect } from "vitest";
import { SongSnapshot } from "@moc/contracts";
import { SEED_ENTRIES, seedSnapshots } from "./seed-genres.js";

describe("seed-genres", () => {
  it("contains 24 entries: 12 genres × (1 mainstream + 1 niche)", () => {
    expect(SEED_ENTRIES).toHaveLength(24);
    const genres = new Set(SEED_ENTRIES.map((e) => e.genre));
    expect(genres.size).toBe(12);
    for (const g of genres) {
      const forGenre = SEED_ENTRIES.filter((e) => e.genre === g);
      expect(forGenre.find((e) => e.popularity === "mainstream")).toBeDefined();
      expect(forGenre.find((e) => e.popularity === "niche")).toBeDefined();
    }
  });

  it("every snapshot parses against the SongSnapshot Zod schema", () => {
    for (const e of SEED_ENTRIES) {
      expect(() => SongSnapshot.parse(e.snapshot)).not.toThrow();
    }
  });

  it("seedSnapshots() returns the snapshot list", () => {
    const list = seedSnapshots();
    expect(list).toHaveLength(24);
    for (const s of list) {
      expect(s.kind).toBe("track");
    }
  });
});
