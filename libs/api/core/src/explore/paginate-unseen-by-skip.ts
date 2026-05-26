import type { SongSnapshot } from "@moc/contracts";

import { computeSnapshotHash } from "../play/snapshot-hash.js";
import {
  dedupHistoryAsymmetric,
  type AsymmetricSlot,
  type AsymmetricSwipe,
} from "./dedup-history.js";

// Default number of unseen tracks to take per artist per paginate call.
export const PAGINATE_UNSEEN_DEFAULT_TAKE = 3;

export interface PaginateUnseenBySkipInput {
  searchResults: SongSnapshot[];
  swipeHistory: ReadonlyArray<AsymmetricSwipe>;
  currentSlot: AsymmetricSlot;
  takeCount?: number;
}

/**
 * Pure helper for per-artist pagination in the taste-driven adjacency phase.
 *
 * Iterates `searchResults` in order, applies `dedupHistoryAsymmetric`
 * (LOGIC-41) per item, and returns the first `takeCount` (default 3) items
 * that pass the filter — or fewer if the list is exhausted before `takeCount`
 * unseen items are found.
 *
 * Pure and deterministic (LOGIC-53): same inputs always produce the same
 * output; no I/O, no randomness, no global state; never throws. Preserves
 * the input order of `searchResults` — the first unseen tracks in position
 * order are returned, implementing the "paginate-by-skip" pattern described
 * in the feature spec.
 */
export function paginateUnseenBySkip(input: PaginateUnseenBySkipInput): SongSnapshot[] {
  const { searchResults, swipeHistory, currentSlot } = input;
  const takeCount = input.takeCount ?? PAGINATE_UNSEEN_DEFAULT_TAKE;

  const result: SongSnapshot[] = [];
  for (const snap of searchResults) {
    if (result.length >= takeCount) break;
    const eligible = dedupHistoryAsymmetric({
      snapshotHash: computeSnapshotHash(snap),
      swipeHistory,
      currentSlot,
    });
    if (eligible) {
      result.push(snap);
    }
  }
  return result;
}
