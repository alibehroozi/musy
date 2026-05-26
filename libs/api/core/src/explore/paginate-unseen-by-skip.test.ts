// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under LOGIC-53.

import { describe, it, expect } from "vitest";
import type { SongSnapshot } from "@moc/contracts";
import { paginateUnseenBySkip, PAGINATE_UNSEEN_DEFAULT_TAKE } from "./paginate-unseen-by-skip.js";
import type { AsymmetricSlot, AsymmetricSwipe } from "./dedup-history.js";
import { computeSnapshotHash } from "../play/snapshot-hash.js";

function snap(title: string, artist: string): SongSnapshot {
  return { title, artist, kind: "track" };
}

const SLOT: AsymmetricSlot = { weekday: "monday", timeOfDay: "morning" };

// Swipe at a specific time, matched to the given slot.
// Monday morning is approx. 2026-05-25 09:00 UTC.
const MONDAY_MORNING = new Date("2026-05-25T09:00:00Z");

function rightSwipe(snapshot: SongSnapshot): AsymmetricSwipe {
  return {
    snapshotHash: computeSnapshotHash(snapshot),
    direction: "right",
    at: MONDAY_MORNING,
  };
}

function leftSwipe(snapshot: SongSnapshot): AsymmetricSwipe {
  return {
    snapshotHash: computeSnapshotHash(snapshot),
    direction: "left",
    at: MONDAY_MORNING,
  };
}

describe("LOGIC-53: paginateUnseenBySkip is pure and deterministic", () => {
  it("returns up to takeCount unseen snapshots from the beginning of the list", () => {
    const tracks = [snap("A", "X"), snap("B", "X"), snap("C", "X"), snap("D", "X")];
    const result = paginateUnseenBySkip({
      searchResults: tracks,
      swipeHistory: [],
      currentSlot: SLOT,
      takeCount: 3,
    });
    expect(result).toHaveLength(3);
    expect(result.map((s) => s.title)).toEqual(["A", "B", "C"]);
  });

  it("skips already-swiped (left) tracks and takes next unseen", () => {
    const a = snap("A", "X");
    const b = snap("B", "X");
    const c = snap("C", "X");
    const tracks = [a, b, c];
    const result = paginateUnseenBySkip({
      searchResults: tracks,
      swipeHistory: [leftSwipe(a)],
      currentSlot: SLOT,
      takeCount: 2,
    });
    // A is left-swiped → skip. Returns B and C.
    expect(result.map((s) => s.title)).toEqual(["B", "C"]);
  });

  it("skips right-swiped tracks in the same slot", () => {
    const a = snap("A", "X");
    const b = snap("B", "X");
    const c = snap("C", "X");
    const tracks = [a, b, c];
    const result = paginateUnseenBySkip({
      searchResults: tracks,
      swipeHistory: [rightSwipe(b)],
      currentSlot: SLOT,
      takeCount: 2,
    });
    // B is right-swiped in the same slot → skip. Returns A and C.
    expect(result.map((s) => s.title)).toEqual(["A", "C"]);
  });

  it("returns fewer than takeCount if list is exhausted", () => {
    const a = snap("A", "X");
    const b = snap("B", "X");
    const c = snap("C", "X");
    const tracks = [a, b, c];
    const result = paginateUnseenBySkip({
      searchResults: tracks,
      swipeHistory: [leftSwipe(a), leftSwipe(b), leftSwipe(c)],
      currentSlot: SLOT,
      takeCount: 3,
    });
    expect(result).toHaveLength(0);
  });

  it("preserves input order of searchResults", () => {
    const tracks = [snap("Z", "X"), snap("A", "X"), snap("M", "X")];
    const result = paginateUnseenBySkip({
      searchResults: tracks,
      swipeHistory: [],
      currentSlot: SLOT,
      takeCount: 3,
    });
    expect(result.map((s) => s.title)).toEqual(["Z", "A", "M"]);
  });

  it(`defaults to takeCount=${PAGINATE_UNSEEN_DEFAULT_TAKE} when not specified`, () => {
    const tracks = Array.from({ length: 10 }, (_, i) => snap(`T${i}`, "X"));
    const result = paginateUnseenBySkip({
      searchResults: tracks,
      swipeHistory: [],
      currentSlot: SLOT,
    });
    expect(result).toHaveLength(PAGINATE_UNSEEN_DEFAULT_TAKE);
  });

  it("is deterministic — same inputs produce the same output on repeated calls", () => {
    const tracks = [snap("A", "X"), snap("B", "X"), snap("C", "X")];
    const input = { searchResults: tracks, swipeHistory: [], currentSlot: SLOT, takeCount: 2 };
    const r1 = paginateUnseenBySkip(input);
    const r2 = paginateUnseenBySkip(input);
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
  });

  it("does not mutate the searchResults or swipeHistory inputs", () => {
    const trackA = snap("A", "X");
    const swipe = leftSwipe(trackA);
    const tracks = [trackA, snap("B", "X")];
    const history = [swipe];
    paginateUnseenBySkip({ searchResults: tracks, swipeHistory: history, currentSlot: SLOT });
    expect(tracks).toHaveLength(2);
    expect(history).toHaveLength(1);
  });

  it("returns empty array for empty searchResults", () => {
    const result = paginateUnseenBySkip({
      searchResults: [],
      swipeHistory: [],
      currentSlot: SLOT,
    });
    expect(result).toEqual([]);
  });

  it("never throws on any input", () => {
    expect(() =>
      paginateUnseenBySkip({ searchResults: [], swipeHistory: [], currentSlot: SLOT }),
    ).not.toThrow();
  });
});
