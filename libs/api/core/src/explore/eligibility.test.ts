// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under LOGIC-33.

import { describe, it, expect } from "vitest";
import type { TimeOfDayValue, WeekdayValue } from "@moc/contracts";

import { isEligibleAtSlot, type EligibilitySwipe } from "./eligibility.js";

// Anchor dates exercised throughout. 2026-05-19 is a Tuesday; the rest are
// adjacent weekdays so we can sample every (weekday, timeOfDay) combination
// without re-deriving from getDay() in each test.
const TUE_EVENING = new Date(2026, 4, 19, 19, 30); // Tue 19:30 → tue / evening
const TUE_LATE_EVENING = new Date(2026, 4, 19, 23, 30); // Tue 23:30 → tue / evening (boundary check belongs to LOGIC-29)

function tueEveningSwipe(
  snapshotHash: string,
  direction: "right" | "left" = "right",
): EligibilitySwipe {
  return { snapshotHash, direction, at: TUE_EVENING };
}

const tueEveningSlot: { weekday: WeekdayValue; timeOfDay: TimeOfDayValue } = {
  weekday: "tue",
  timeOfDay: "evening",
};

const wedMorningSlot: { weekday: WeekdayValue; timeOfDay: TimeOfDayValue } = {
  weekday: "wed",
  timeOfDay: "morning",
};

describe("LOGIC-33: isEligibleAtSlot — pure contextual eligibility helper", () => {
  it("returns true when swipeHistory is empty (first-run case)", () => {
    expect(
      isEligibleAtSlot({
        snapshotHash: "h-1",
        swipeHistory: [],
        currentSlot: tueEveningSlot,
      }),
    ).toBe(true);
  });

  it("returns false when a swipe of the same hash lands in the current slot", () => {
    expect(
      isEligibleAtSlot({
        snapshotHash: "h-1",
        swipeHistory: [tueEveningSwipe("h-1")],
        currentSlot: tueEveningSlot,
      }),
    ).toBe(false);
  });

  it("returns true when a swipe of the same hash is in a different slot", () => {
    expect(
      isEligibleAtSlot({
        snapshotHash: "h-1",
        swipeHistory: [tueEveningSwipe("h-1")],
        currentSlot: wedMorningSlot,
      }),
    ).toBe(true);
  });

  it("returns true when only a different snapshot is swiped at the current slot", () => {
    expect(
      isEligibleAtSlot({
        snapshotHash: "h-1",
        swipeHistory: [tueEveningSwipe("h-OTHER")],
        currentSlot: tueEveningSlot,
      }),
    ).toBe(true);
  });

  it("burns the slot for both directions equally — left-swipe also excludes", () => {
    expect(
      isEligibleAtSlot({
        snapshotHash: "h-1",
        swipeHistory: [tueEveningSwipe("h-1", "left")],
        currentSlot: tueEveningSlot,
      }),
    ).toBe(false);
  });

  it("28 distinct slot swipes (7 weekdays × 4 time-of-day buckets) burn the song everywhere", () => {
    // 2026-05-17 is a Sunday — anchor a full week.
    const weekStartSun = new Date(2026, 4, 17, 0, 0);
    const hoursPerSlot: ReadonlyArray<{ hour: number; timeOfDay: TimeOfDayValue }> = [
      { hour: 2, timeOfDay: "night" },
      { hour: 9, timeOfDay: "morning" },
      { hour: 14, timeOfDay: "afternoon" },
      { hour: 20, timeOfDay: "evening" },
    ];
    const weekdays: readonly WeekdayValue[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
    const allSwipes: EligibilitySwipe[] = [];
    for (let d = 0; d < 7; d++) {
      for (const slot of hoursPerSlot) {
        const at = new Date(weekStartSun);
        at.setDate(weekStartSun.getDate() + d);
        at.setHours(slot.hour, 0, 0, 0);
        allSwipes.push({ snapshotHash: "h-1", direction: "right", at });
      }
    }
    expect(allSwipes).toHaveLength(28);

    // Every weekday × every timeOfDay slot is now burnt for h-1.
    for (const weekday of weekdays) {
      for (const slot of hoursPerSlot) {
        expect(
          isEligibleAtSlot({
            snapshotHash: "h-1",
            swipeHistory: allSwipes,
            currentSlot: { weekday, timeOfDay: slot.timeOfDay },
          }),
        ).toBe(false);
      }
    }
  });

  it("27 slots burnt leaves the 28th eligible", () => {
    // Burn every slot EXCEPT Wednesday morning.
    const weekStartSun = new Date(2026, 4, 17, 0, 0);
    const hoursPerSlot: ReadonlyArray<{ hour: number; timeOfDay: TimeOfDayValue }> = [
      { hour: 2, timeOfDay: "night" },
      { hour: 9, timeOfDay: "morning" },
      { hour: 14, timeOfDay: "afternoon" },
      { hour: 20, timeOfDay: "evening" },
    ];
    const allSwipes: EligibilitySwipe[] = [];
    for (let d = 0; d < 7; d++) {
      for (const slot of hoursPerSlot) {
        // Skip Wednesday (d=3) morning.
        if (d === 3 && slot.timeOfDay === "morning") continue;
        const at = new Date(weekStartSun);
        at.setDate(weekStartSun.getDate() + d);
        at.setHours(slot.hour, 0, 0, 0);
        allSwipes.push({ snapshotHash: "h-1", direction: "right", at });
      }
    }
    expect(allSwipes).toHaveLength(27);
    expect(
      isEligibleAtSlot({
        snapshotHash: "h-1",
        swipeHistory: allSwipes,
        currentSlot: { weekday: "wed", timeOfDay: "morning" },
      }),
    ).toBe(true);
  });

  it("a malformed swipe timestamp (missing / NaN) burns all slots for that hash", () => {
    const malformed: EligibilitySwipe = {
      snapshotHash: "h-1",
      direction: "right",
      // @ts-expect-error — exercising the defensive parse path for missing/undefined at
      at: undefined,
    };
    expect(
      isEligibleAtSlot({
        snapshotHash: "h-1",
        swipeHistory: [malformed],
        currentSlot: tueEveningSlot,
      }),
    ).toBe(false);
    expect(
      isEligibleAtSlot({
        snapshotHash: "h-1",
        swipeHistory: [malformed],
        currentSlot: wedMorningSlot,
      }),
    ).toBe(false);
    // A malformed swipe for a *different* hash does not affect this hash.
    const malformedOther: EligibilitySwipe = {
      snapshotHash: "h-OTHER",
      direction: "right",
      // @ts-expect-error — exercising the defensive parse path for missing/undefined at on a different hash
      at: undefined,
    };
    expect(
      isEligibleAtSlot({
        snapshotHash: "h-1",
        swipeHistory: [malformedOther],
        currentSlot: tueEveningSlot,
      }),
    ).toBe(true);
  });

  it("an Invalid Date `at` also burns all slots for that hash", () => {
    const invalid: EligibilitySwipe = {
      snapshotHash: "h-1",
      direction: "right",
      at: new Date("not-a-date"),
    };
    expect(Number.isNaN(invalid.at.getTime())).toBe(true);
    expect(
      isEligibleAtSlot({
        snapshotHash: "h-1",
        swipeHistory: [invalid],
        currentSlot: tueEveningSlot,
      }),
    ).toBe(false);
  });

  it("ignores the month axis — only weekday + timeOfDay influence eligibility", () => {
    // Two swipes of the same hash in different months but same (weekday, timeOfDay):
    // both burn the same slot, but the eligibility at a *different* slot in
    // either month stays true.
    const julyTueEvening = new Date(2026, 6, 21, 19, 30); // Tue evening
    const swipes: EligibilitySwipe[] = [
      { snapshotHash: "h-1", direction: "right", at: TUE_EVENING },
      { snapshotHash: "h-1", direction: "right", at: julyTueEvening },
    ];
    expect(
      isEligibleAtSlot({
        snapshotHash: "h-1",
        swipeHistory: swipes,
        currentSlot: tueEveningSlot,
      }),
    ).toBe(false);
    expect(
      isEligibleAtSlot({
        snapshotHash: "h-1",
        swipeHistory: swipes,
        currentSlot: wedMorningSlot,
      }),
    ).toBe(true);
  });

  it("is deterministic — equal inputs produce equal outputs across many calls", () => {
    const swipes: EligibilitySwipe[] = [tueEveningSwipe("h-1"), tueEveningSwipe("h-2", "left")];
    for (let i = 0; i < 10; i++) {
      expect(
        isEligibleAtSlot({
          snapshotHash: "h-1",
          swipeHistory: swipes,
          currentSlot: tueEveningSlot,
        }),
      ).toBe(false);
      expect(
        isEligibleAtSlot({
          snapshotHash: "h-3",
          swipeHistory: swipes,
          currentSlot: tueEveningSlot,
        }),
      ).toBe(true);
    }
  });

  it("anchor: Tue 23:30 is in the 'evening' bucket — boundary respected", () => {
    expect(
      isEligibleAtSlot({
        snapshotHash: "h-1",
        swipeHistory: [{ snapshotHash: "h-1", direction: "right", at: TUE_LATE_EVENING }],
        currentSlot: tueEveningSlot,
      }),
    ).toBe(false);
  });
});
