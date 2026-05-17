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

/**
 * Bulk companion to `isEligibleAtSlot`: collect every `snapshotHash` from
 * `swipeHistory` that is "burnt" at `currentSlot` — i.e. for which
 * `isEligibleAtSlot` would return `false`. Useful in the queue builder
 * where the same slot decision is applied to N candidates and a single
 * pass over the swipe ledger is cheaper than N invocations of the
 * per-candidate helper.
 *
 * Matches the defensive contract of `isEligibleAtSlot`: a swipe with a
 * missing / NaN `at` adds its `snapshotHash` to the burnt set
 * unconditionally (treated as all-slots-burnt for that hash).
 */
export function collectSlotBurntHashes(
  swipeHistory: ReadonlyArray<EligibilitySwipe>,
  currentSlot: EligibilitySlot,
): Set<string> {
  const burnt = new Set<string>();
  for (const s of swipeHistory) {
    if (!isUsableDate(s.at)) {
      burnt.add(s.snapshotHash);
      continue;
    }
    if (
      bucketWeekday(s.at) === currentSlot.weekday &&
      bucketTimeOfDay(s.at) === currentSlot.timeOfDay
    ) {
      burnt.add(s.snapshotHash);
    }
  }
  return burnt;
}

/**
 * Project a `Date` into the eligibility slot tuple that `isEligibleAtSlot`
 * and `collectSlotBurntHashes` consume. Pure wrapper around
 * `bucketWeekday` / `bucketTimeOfDay` from `@moc/api-core`.
 */
export function slotFor(date: Date): EligibilitySlot {
  return {
    weekday: bucketWeekday(date),
    timeOfDay: bucketTimeOfDay(date),
  };
}

function isUsableDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}
