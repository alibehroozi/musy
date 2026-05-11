export interface DragInput {
  dx: number;
  dy: number;
  threshold: number;
}

export type SwipeDirection = "right" | "left";

export function directionFromDrag(input: DragInput): SwipeDirection | null {
  const { dx, threshold } = input;
  if (dx >= threshold) return "right";
  if (dx <= -threshold) return "left";
  return null;
}
