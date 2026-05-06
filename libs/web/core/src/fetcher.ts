import type { ZodSchema } from "zod";

/**
 * Type-safe fetch that validates the response against a Zod schema from
 * @moc/contracts. The boundary is the only place runtime validation happens —
 * everything downstream gets the inferred TypeScript type.
 */
export async function fetchJson<T>(
  url: string,
  schema: ZodSchema<T>,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status} ${res.statusText}`);
  }
  const body: unknown = await res.json();
  return schema.parse(body);
}
