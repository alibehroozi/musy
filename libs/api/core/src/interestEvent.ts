export type InterestEventType = "explored" | "saved";

const EVENT_SCORES: Record<InterestEventType, number> = {
  explored: 3,
  saved: 8,
};

export interface ApplyInterestEventResult {
  score: number;
  scoreChanged: boolean;
}

/**
 * Computes the new interest score after an event, applying the max-rule:
 * the score for a (userId, songKey) pair is monotonically non-decreasing.
 */
export function applyInterestEvent(
  currentScore: number | null,
  eventType: InterestEventType,
): ApplyInterestEventResult {
  const eventScore = EVENT_SCORES[eventType];
  const prev = currentScore ?? 0;
  const score = Math.max(prev, eventScore);
  return { score, scoreChanged: score !== prev };
}
