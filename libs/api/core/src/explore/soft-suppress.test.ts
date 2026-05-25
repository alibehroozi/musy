// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under LOGIC-42.

import { describe, it, expect } from "vitest";

import { softSuppressedArtists, type SoftSuppressSwipe } from "./soft-suppress.js";

function leftSwipe(artist: string): SoftSuppressSwipe {
  return { direction: "left", artist };
}

function rightSwipe(artist: string): SoftSuppressSwipe {
  return { direction: "right", artist };
}

describe("LOGIC-42: softSuppressedArtists — pure artist soft-suppression helper", () => {
  it("empty swipeHistory → empty Set", () => {
    expect(softSuppressedArtists({ swipeHistory: [] })).toEqual(new Set<string>());
  });

  it("single left-swipe is noise (< threshold) → not suppressed", () => {
    expect(softSuppressedArtists({ swipeHistory: [leftSwipe("Skrillex")] })).toEqual(
      new Set<string>(),
    );
  });

  it("two left-swipes on the same artist → suppressed (threshold default 2)", () => {
    const out = softSuppressedArtists({
      swipeHistory: [leftSwipe("Skrillex"), leftSwipe("Skrillex")],
    });
    expect(out.has("skrillex")).toBe(true);
    expect(out.size).toBe(1);
  });

  it("returns lowercase-normalized artist keys (case-insensitive count)", () => {
    const out = softSuppressedArtists({
      swipeHistory: [leftSwipe("Skrillex"), leftSwipe("SKRILLEX")],
    });
    expect(out.has("skrillex")).toBe(true);
    expect(out.has("Skrillex")).toBe(false);
  });

  it("trims whitespace before counting/normalizing", () => {
    const out = softSuppressedArtists({
      swipeHistory: [leftSwipe(" Skrillex "), leftSwipe("skrillex")],
    });
    expect(out.has("skrillex")).toBe(true);
  });

  it("right-swipes never contribute to the count", () => {
    const out = softSuppressedArtists({
      swipeHistory: [rightSwipe("Skrillex"), rightSwipe("Skrillex"), rightSwipe("Skrillex")],
    });
    expect(out.size).toBe(0);
  });

  it("mixed right + left for the same artist — only the left count gates suppression", () => {
    expect(
      softSuppressedArtists({
        swipeHistory: [leftSwipe("Skrillex"), rightSwipe("Skrillex")],
      }).has("skrillex"),
    ).toBe(false);
    expect(
      softSuppressedArtists({
        swipeHistory: [leftSwipe("Skrillex"), leftSwipe("Skrillex"), rightSwipe("Skrillex")],
      }).has("skrillex"),
    ).toBe(true);
  });

  it("multiple distinct artists each crossing the threshold all appear", () => {
    const out = softSuppressedArtists({
      swipeHistory: [
        leftSwipe("Skrillex"),
        leftSwipe("Skrillex"),
        leftSwipe("Deadmau5"),
        leftSwipe("Deadmau5"),
        leftSwipe("Aphex Twin"),
      ],
    });
    expect(out.has("skrillex")).toBe(true);
    expect(out.has("deadmau5")).toBe(true);
    expect(out.has("aphex twin")).toBe(false); // only 1 left
  });

  it("parameterized threshold (≥ 3 collapses below the default-2 suppression)", () => {
    const history = [leftSwipe("Skrillex"), leftSwipe("Skrillex")];
    expect(softSuppressedArtists({ swipeHistory: history, threshold: 3 }).has("skrillex")).toBe(
      false,
    );
    expect(
      softSuppressedArtists({
        swipeHistory: [...history, leftSwipe("Skrillex")],
        threshold: 3,
      }).has("skrillex"),
    ).toBe(true);
  });

  it("deterministic — repeated calls with the same inputs yield equal Sets", () => {
    const history = [leftSwipe("Skrillex"), leftSwipe("Skrillex"), leftSwipe("Deadmau5")];
    const a = softSuppressedArtists({ swipeHistory: history });
    const b = softSuppressedArtists({ swipeHistory: history });
    expect([...a].sort()).toEqual([...b].sort());
  });
});
