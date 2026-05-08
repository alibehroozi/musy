import { createHash } from "crypto";

export function normalizeQuery(query: string): string {
  return query.trim().toLowerCase();
}

export function computeQueryHash(query: string): string {
  return createHash("sha256").update(normalizeQuery(query)).digest("hex");
}
