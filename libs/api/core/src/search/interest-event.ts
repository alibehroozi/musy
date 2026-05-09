import type { InterestEventType, ProviderName } from "@moc/contracts";

export const INTEREST_SCORE_BY_EVENT: Record<InterestEventType, number> = {
  explored: 3,
  completed: 5,
  saved: 8,
};

export interface ApplyInterestEventResult {
  score: number;
  scoreChanged: boolean;
}

/**
 * Pure max-rule: a saved event (8) is never erased by a subsequent
 * explored event (3); re-saving stays at 8 idempotently.
 *
 * Returns the new score plus whether the score actually moved — the
 * repository uses scoreChanged to decide between $set and a no-op,
 * keeping DATA-06 monotonic-non-decreasing.
 */
export function applyInterestEvent(
  currentScore: number | null,
  eventType: InterestEventType,
): ApplyInterestEventResult {
  const eventScore = INTEREST_SCORE_BY_EVENT[eventType];
  if (currentScore === null) {
    return { score: eventScore, scoreChanged: true };
  }
  const next = Math.max(currentScore, eventScore);
  return { score: next, scoreChanged: next !== currentScore };
}

/** Stable per-(userId, song) key. Used as a unique compound index column. */
export function songKeyOf(source: ProviderName, externalId: string): string {
  return `${source}:${externalId}`;
}
