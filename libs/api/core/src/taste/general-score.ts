import type { ContextAxis } from "@moc/contracts";
import { clampScore } from "./score-deltas.js";

export interface ContextScoreRow {
  readonly axis: ContextAxis;
  readonly value: string;
  readonly score: number;
}

export interface BucketScoreRow {
  readonly bucketId: string;
  readonly score: number;
}

// LOGIC-32: the four axes the per-request general score averages over.
// Missing axes contribute 0 to the mean (denominator is always 4) so a
// song with no listening / bucket history collapses to 0 — which is the
// "don't downrank, don't uprank" default the ranking layer expects.
const AXES: readonly (ContextAxis | "bucket")[] = ["weekday", "timeOfDay", "month", "bucket"];

function meanOrZero(rows: readonly { readonly score: number }[]): number {
  if (rows.length === 0) return 0;
  let sum = 0;
  for (const r of rows) sum += r.score;
  return sum / rows.length;
}

export function generalScore(
  contextRows: readonly ContextScoreRow[],
  bucketRows: readonly BucketScoreRow[],
): number {
  if (contextRows.length === 0 && bucketRows.length === 0) return 0;
  const byAxis = new Map<ContextAxis | "bucket", { readonly score: number }[]>();
  for (const axis of AXES) byAxis.set(axis, []);
  for (const r of contextRows) byAxis.get(r.axis)!.push({ score: r.score });
  for (const r of bucketRows) byAxis.get("bucket")!.push({ score: r.score });
  let total = 0;
  for (const axis of AXES) total += meanOrZero(byAxis.get(axis)!);
  return clampScore(Math.round(total / AXES.length));
}
