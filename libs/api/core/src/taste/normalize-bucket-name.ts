/**
 * LOGIC-35: deterministic and total bucket-name normalization key.
 * Trims, collapses internal whitespace to a single space, lowercases.
 * Used as the equality key when checking for duplicate bucket names
 * (two names that are identical after normalization are the same bucket).
 */
export function normalizeBucketName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}
