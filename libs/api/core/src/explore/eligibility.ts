import type { TimeOfDayValue, WeekdayValue } from "@moc/contracts";
import { bucketTimeOfDay, bucketWeekday } from "../taste/time-buckets.js";

export interface EligibilitySwipe {
  snapshotHash: string;
  direction: "right" | "left";
  at: Date;
}

export interface EligibilitySlot {
  weekday: WeekdayValue;
  timeOfDay: TimeOfDayValue;
}

export interface IsEligibleAtSlotInput {
  snapshotHash: string;
  swipeHistory: ReadonlyArray<EligibilitySwipe>;
  currentSlot: EligibilitySlot;
}

/**
 * LOGIC-33: contextual eligibility for an Explore candidate.
 *
 * Returns `true` iff no swipe in `swipeHistory` matches BOTH the input
 * `snapshotHash` AND the input `currentSlot`. Slot match uses
 * `bucketWeekday(at)` + `bucketTimeOfDay(at)`.
 *
 * Defensive: a swipe whose `at` is missing, not a `Date`, or yields `NaN`
 * from `getTime()` is treated as **all-slots-burnt** for its hash — the
 * helper returns `false` whenever such a swipe matches the input hash,
 * regardless of `currentSlot`. This way one malformed historical row
 * spams "still excluded" rather than throwing or accidentally re-showing
 * a song the user has actually swiped.
 *
 * Both swipe directions burn the slot equally — the user has judged the
 * song in that context, so the song stops appearing there for them.
 */
export function isEligibleAtSlot(input: IsEligibleAtSlotInput): boolean {
  const { snapshotHash, swipeHistory, currentSlot } = input;
  for (const s of swipeHistory) {
    if (s.snapshotHash !== snapshotHash) continue;
    if (!isUsableDate(s.at)) {
      // Malformed timestamp on a swipe for this hash → treat as all-slots-burnt.
      return false;
    }
    if (
      bucketWeekday(s.at) === currentSlot.weekday &&
      bucketTimeOfDay(s.at) === currentSlot.timeOfDay
    ) {
      return false;
    }
  }
  return true;
}

function isUsableDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}
