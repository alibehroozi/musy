export interface PlayableHandoffDecisionArgs {
  progressMs: number;
  durationMs: number;
  lookaheadMs: number;
}

export function playableHandoffDecision({
  progressMs,
  durationMs,
  lookaheadMs,
}: PlayableHandoffDecisionArgs): boolean {
  if (!Number.isFinite(progressMs)) return false;
  if (!Number.isFinite(durationMs)) return false;
  if (!Number.isFinite(lookaheadMs)) return false;
  if (durationMs <= 0) return false;
  if (progressMs < 0) return false;
  if (lookaheadMs <= 0) return false;
  const remaining = durationMs - progressMs;
  return remaining > 0 && remaining <= lookaheadMs;
}
