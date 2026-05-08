export function bumpScore(oldScore: number, eventType: "started" | "completed"): number {
  return Math.max(oldScore, eventType === "started" ? 3 : 5);
}
