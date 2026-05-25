import type { TimeOfDayValue, WeekdayValue } from "@moc/contracts";
import { bucketTimeOfDay, bucketWeekday } from "../taste/time-buckets.js";

export interface AsymmetricSwipe {
  snapshotHash: string;
  direction: "right" | "left";
  at: Date;
}

export interface AsymmetricSlot {
  weekday: WeekdayValue;
  timeOfDay: TimeOfDayValue;
}

export interface DedupHistoryAsymmetricInput {
  snapshotHash: string;
  swipeHistory: ReadonlyArray<AsymmetricSwipe>;
  currentSlot: AsymmetricSlot;
}

/**
 * LOGIC-41: asymmetric eligibility for an Explore candidate.
 *
 * Returns `false` (ineligible) if any swipe in `swipeHistory` matches the
 * input `snapshotHash` AND falls into one of two cases:
 *   - direction === "left"  — forever exclusion regardless of slot
 *   - direction === "right" — slot exclusion only (matches currentSlot)
 *
 * A swipe whose `at` is unusable (missing, non-Date, or yields NaN from
 * getTime()) is treated as all-slots-burnt for its hash regardless of
 * direction — defensive against malformed historical rows.
 */
export function dedupHistoryAsymmetric(input: DedupHistoryAsymmetricInput): boolean {
  const { snapshotHash, swipeHistory, currentSlot } = input;
  for (const s of swipeHistory) {
    if (s.snapshotHash !== snapshotHash) continue;
    if (!isUsableDate(s.at)) return false;
    if (s.direction === "left") return false;
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
 * Bulk companion: returns the Set of every `snapshotHash` for which
 * `dedupHistoryAsymmetric` would return `false`. Single pass over the
 * swipe ledger — cheaper than N invocations of the per-candidate helper
 * when the queue builder is filtering many candidates against the same
 * history + slot.
 */
export function collectAsymmetricExcludedHashes(
  swipeHistory: ReadonlyArray<AsymmetricSwipe>,
  currentSlot: AsymmetricSlot,
): Set<string> {
  const burnt = new Set<string>();
  for (const s of swipeHistory) {
    if (!isUsableDate(s.at)) {
      burnt.add(s.snapshotHash);
      continue;
    }
    if (s.direction === "left") {
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

function isUsableDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}
