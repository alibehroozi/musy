// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under LOGIC-41.

import { describe, it, expect } from "vitest";
import type { TimeOfDayValue, WeekdayValue } from "@moc/contracts";

import {
  collectAsymmetricExcludedHashes,
  dedupHistoryAsymmetric,
  type AsymmetricSwipe,
} from "./dedup-history.js";

// 2026-05-19 = Tuesday.
const TUE_EVENING = new Date(2026, 4, 19, 19, 30);
const WED_MORNING = new Date(2026, 4, 20, 9, 0);

const tueEveningSlot: { weekday: WeekdayValue; timeOfDay: TimeOfDayValue } = {
  weekday: "tue",
  timeOfDay: "evening",
};

const wedMorningSlot: { weekday: WeekdayValue; timeOfDay: TimeOfDayValue } = {
  weekday: "wed",
  timeOfDay: "morning",
};

function rightSwipe(snapshotHash: string, at: Date): AsymmetricSwipe {
  return { snapshotHash, direction: "right", at };
}

function leftSwipe(snapshotHash: string, at: Date): AsymmetricSwipe {
  return { snapshotHash, direction: "left", at };
}

describe("LOGIC-41: dedupHistoryAsymmetric — asymmetric eligibility (left forever, right slot)", () => {
  it("empty swipeHistory → true (first-run case)", () => {
    expect(
      dedupHistoryAsymmetric({
        snapshotHash: "h-1",
        swipeHistory: [],
        currentSlot: tueEveningSlot,
      }),
    ).toBe(true);
  });

  it("right-swipe in the current slot → false (slot burnt)", () => {
    expect(
      dedupHistoryAsymmetric({
        snapshotHash: "h-1",
        swipeHistory: [rightSwipe("h-1", TUE_EVENING)],
        currentSlot: tueEveningSlot,
      }),
    ).toBe(false);
  });

  it("right-swipe in a DIFFERENT slot → true (other slot still eligible)", () => {
    expect(
      dedupHistoryAsymmetric({
        snapshotHash: "h-1",
        swipeHistory: [rightSwipe("h-1", WED_MORNING)],
        currentSlot: tueEveningSlot,
      }),
    ).toBe(true);
  });

  it("left-swipe in the current slot → false (forever exclusion includes the current slot)", () => {
    expect(
      dedupHistoryAsymmetric({
        snapshotHash: "h-1",
        swipeHistory: [leftSwipe("h-1", TUE_EVENING)],
        currentSlot: tueEveningSlot,
      }),
    ).toBe(false);
  });

  it("left-swipe in a DIFFERENT slot → false (left burns forever, all slots)", () => {
    expect(
      dedupHistoryAsymmetric({
        snapshotHash: "h-1",
        swipeHistory: [leftSwipe("h-1", WED_MORNING)],
        currentSlot: tueEveningSlot,
      }),
    ).toBe(false);
  });

  it("left-swipe on a different hash → true (only affects its own hash)", () => {
    expect(
      dedupHistoryAsymmetric({
        snapshotHash: "h-target",
        swipeHistory: [leftSwipe("h-other", WED_MORNING)],
        currentSlot: tueEveningSlot,
      }),
    ).toBe(true);
  });

  it("malformed `at` Date with matching hash → false (defensive all-slots-burnt regardless of direction)", () => {
    const badAt = new Date("not-a-date");
    expect(
      dedupHistoryAsymmetric({
        snapshotHash: "h-1",
        swipeHistory: [{ snapshotHash: "h-1", direction: "right", at: badAt }],
        currentSlot: wedMorningSlot,
      }),
    ).toBe(false);
  });

  it("deterministic — repeated calls with the same inputs yield the same boolean", () => {
    const history = [rightSwipe("h-1", WED_MORNING), leftSwipe("h-2", TUE_EVENING)];
    for (let i = 0; i < 50; i++) {
      expect(
        dedupHistoryAsymmetric({
          snapshotHash: "h-1",
          swipeHistory: history,
          currentSlot: tueEveningSlot,
        }),
      ).toBe(true);
      expect(
        dedupHistoryAsymmetric({
          snapshotHash: "h-2",
          swipeHistory: history,
          currentSlot: wedMorningSlot,
        }),
      ).toBe(false);
    }
  });

  it("returns false when at least one matching swipe is asymmetrically ineligible (mixed history)", () => {
    // Two swipes for the same hash: one right at WED_MORNING (slot-burnt only),
    // one left at WED_MORNING (forever-burnt). The left wins at TUE_EVENING.
    expect(
      dedupHistoryAsymmetric({
        snapshotHash: "h-1",
        swipeHistory: [rightSwipe("h-1", WED_MORNING), leftSwipe("h-1", WED_MORNING)],
        currentSlot: tueEveningSlot,
      }),
    ).toBe(false);
  });
});

describe("LOGIC-41: collectAsymmetricExcludedHashes — bulk companion helper", () => {
  it("returns an empty Set for empty swipeHistory", () => {
    expect(collectAsymmetricExcludedHashes([], tueEveningSlot)).toEqual(new Set<string>());
  });

  it("excludes every left-swiped hash regardless of slot", () => {
    const out = collectAsymmetricExcludedHashes(
      [leftSwipe("h-left", WED_MORNING), rightSwipe("h-other", WED_MORNING)],
      tueEveningSlot,
    );
    expect(out.has("h-left")).toBe(true);
    expect(out.has("h-other")).toBe(false);
  });

  it("includes right-swiped hashes whose slot matches currentSlot, excludes those at other slots", () => {
    const out = collectAsymmetricExcludedHashes(
      [rightSwipe("h-now", TUE_EVENING), rightSwipe("h-other", WED_MORNING)],
      tueEveningSlot,
    );
    expect(out.has("h-now")).toBe(true);
    expect(out.has("h-other")).toBe(false);
  });

  it("treats malformed timestamps as all-slots-burnt for their hash", () => {
    const badAt = new Date("not-a-date");
    const out = collectAsymmetricExcludedHashes(
      [{ snapshotHash: "h-bad", direction: "right", at: badAt }],
      wedMorningSlot,
    );
    expect(out.has("h-bad")).toBe(true);
  });

  it("agrees with the per-snapshot helper on every member of the input", () => {
    const history: AsymmetricSwipe[] = [
      leftSwipe("h-left", WED_MORNING),
      rightSwipe("h-right-now", TUE_EVENING),
      rightSwipe("h-right-other", WED_MORNING),
    ];
    const burnt = collectAsymmetricExcludedHashes(history, tueEveningSlot);
    for (const hash of ["h-left", "h-right-now", "h-right-other", "h-untouched"]) {
      const expectedEligible = dedupHistoryAsymmetric({
        snapshotHash: hash,
        swipeHistory: history,
        currentSlot: tueEveningSlot,
      });
      expect(burnt.has(hash)).toBe(!expectedEligible);
    }
  });
});
