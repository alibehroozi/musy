import type { ZodSchema } from "zod";

/**
 * Thrown by fetchJson when the response is not 2xx. Carries the status so
 * callers can distinguish (e.g. 401 → unauthenticated) without re-fetching.
 */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly statusText: string,
    readonly url: string,
  ) {
    super(`HTTP ${status} ${statusText} for ${url}`);
    this.name = "HttpError";
  }
}

/**
 * Type-safe fetch that validates the response against a Zod schema from
 * @moc/contracts. The boundary is the only place runtime validation happens —
 * everything downstream gets the inferred TypeScript type. On non-2xx the
 * function throws an HttpError carrying the status code.
 */
export async function fetchJson<T>(
  url: string,
  schema: ZodSchema<T>,
  init?: RequestInit,
): Promise<T> {
  // credentials: "include" is the default so the session cookie is sent on
  // cross-origin deployments (web on Pages, api on Cloud Run). Callers can
  // still override by passing credentials explicitly. See LOGIC-19.
  const res = await fetch(url, { credentials: "include", ...init });
  if (!res.ok) {
    throw new HttpError(res.status, res.statusText, url);
  }
  const body: unknown = await res.json();
  return schema.parse(body);
}
