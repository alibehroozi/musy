import type { TimeOfDayValue, WeekdayValue } from "@moc/contracts";

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

export function dedupHistoryAsymmetric(_input: DedupHistoryAsymmetricInput): boolean {
  throw new Error("dedupHistoryAsymmetric: not implemented");
}

export function collectAsymmetricExcludedHashes(
  _swipeHistory: ReadonlyArray<AsymmetricSwipe>,
  _currentSlot: AsymmetricSlot,
): Set<string> {
  throw new Error("collectAsymmetricExcludedHashes: not implemented");
}
