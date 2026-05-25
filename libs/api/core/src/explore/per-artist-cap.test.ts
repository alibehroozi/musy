// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under LOGIC-43.

import { describe, it, expect } from "vitest";
import type { SongSnapshot } from "@moc/contracts";

import { applyPerArtistCap } from "./per-artist-cap.js";

function snap(title: string, artist: string): SongSnapshot {
  return { title, artist, kind: "track", coverUrl: "https://cdn/c.jpg" };
}

describe("LOGIC-43: applyPerArtistCap — pure per-artist cap helper", () => {
  it("empty input → []", () => {
    expect(applyPerArtistCap([])).toEqual([]);
  });

  it("single snapshot is always kept regardless of cap (cap defaults to 2)", () => {
    const input = [snap("Bangarang", "Skrillex")];
    expect(applyPerArtistCap(input)).toEqual(input);
  });

  it("≤ cap items per artist are all kept; order preserved", () => {
    const input = [
      snap("Bangarang", "Skrillex"),
      snap("Scary Monsters", "Skrillex"),
      snap("Strobe", "Deadmau5"),
    ];
    expect(applyPerArtistCap(input)).toEqual(input);
  });

  it("> cap items per artist drop the surplus (keeps first 2 by default, in order)", () => {
    const input = [
      snap("Bangarang", "Skrillex"),
      snap("Scary Monsters", "Skrillex"),
      snap("First of the Year", "Skrillex"), // dropped (3rd Skrillex)
      snap("Strobe", "Deadmau5"),
    ];
    expect(applyPerArtistCap(input)).toEqual([
      snap("Bangarang", "Skrillex"),
      snap("Scary Monsters", "Skrillex"),
      snap("Strobe", "Deadmau5"),
    ]);
  });

  it("artist match is case-insensitive (Skrillex vs SKRILLEX vs skrillex collapse)", () => {
    const input = [
      snap("A", "Skrillex"),
      snap("B", "SKRILLEX"),
      snap("C", "skrillex"), // dropped — 3rd of the same artist
    ];
    expect(applyPerArtistCap(input)).toEqual([snap("A", "Skrillex"), snap("B", "SKRILLEX")]);
  });

  it("artist match is whitespace-trimmed (' Skrillex ' equals 'Skrillex')", () => {
    const input = [
      snap("A", " Skrillex "),
      snap("B", "Skrillex"),
      snap("C", "skrillex"), // dropped — 3rd
    ];
    expect(applyPerArtistCap(input)).toEqual([snap("A", " Skrillex "), snap("B", "Skrillex")]);
  });

  it("does NOT mutate input", () => {
    const input = [
      snap("Bangarang", "Skrillex"),
      snap("Scary Monsters", "Skrillex"),
      snap("First of the Year", "Skrillex"),
    ];
    const copyBefore = JSON.parse(JSON.stringify(input));
    applyPerArtistCap(input);
    expect(input).toEqual(copyBefore);
  });

  it("parameterized cap (cap=1 keeps one per artist)", () => {
    const input = [
      snap("A", "Skrillex"),
      snap("B", "Skrillex"),
      snap("C", "Deadmau5"),
      snap("D", "Skrillex"),
      snap("E", "Deadmau5"),
    ];
    expect(applyPerArtistCap(input, 1)).toEqual([snap("A", "Skrillex"), snap("C", "Deadmau5")]);
  });

  it("parameterized cap (cap=3 raises the threshold)", () => {
    const input = [
      snap("A", "Skrillex"),
      snap("B", "Skrillex"),
      snap("C", "Skrillex"),
      snap("D", "Skrillex"), // dropped — 4th
    ];
    expect(applyPerArtistCap(input, 3)).toEqual([
      snap("A", "Skrillex"),
      snap("B", "Skrillex"),
      snap("C", "Skrillex"),
    ]);
  });

  it("deterministic — same input yields byte-equal output across consecutive calls", () => {
    const input = [
      snap("A", "Skrillex"),
      snap("B", "Skrillex"),
      snap("C", "Skrillex"),
      snap("D", "Deadmau5"),
    ];
    const out1 = applyPerArtistCap(input);
    const out2 = applyPerArtistCap(input);
    expect(JSON.stringify(out1)).toBe(JSON.stringify(out2));
  });
});
