/**
 * Deterministic CSS gradient keyed by the bucket id hash. Same input
 * always produces the same gradient so a reload doesn't reshuffle the
 * palette. Five gradient families mirror the design mockups (bucket
 * card + bucket detail hero use the identical palette so the cover
 * stays visually consistent across surfaces).
 */
const PALETTE = [
  "linear-gradient(135deg, oklch(0.32 0.12 270), oklch(0.18 0.08 320))",
  "linear-gradient(135deg, oklch(0.55 0.18 320), oklch(0.35 0.12 340))",
  "linear-gradient(135deg, oklch(0.45 0.10 60), oklch(0.30 0.08 30))",
  "linear-gradient(135deg, oklch(0.40 0.12 200), oklch(0.25 0.08 230))",
  "linear-gradient(135deg, oklch(0.50 0.10 130), oklch(0.30 0.07 100))",
] as const;

export function gradientFor(bucketId: string): string {
  let h = 0;
  for (let i = 0; i < bucketId.length; i++) {
    h = (h * 31 + bucketId.charCodeAt(i)) | 0;
  }
  return PALETTE[Math.abs(h) % PALETTE.length]!;
}
