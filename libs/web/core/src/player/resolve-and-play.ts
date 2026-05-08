import { ResolveRequest, ResolveResponse } from "@moc/contracts";
import type { SongSnapshot, ResolveResponse as ResolveResponseType } from "@moc/contracts";
import { fetchJson } from "../fetcher.js";

/**
 * POST /play/resolve with the given snapshot and validate the response
 * against the ResolveResponse Zod schema. Throws ZodError on shape drift,
 * HttpError on non-2xx. Returns the validated response for the caller
 * to hand to the audio engine.
 */
export function resolveAndPlay(
  snapshot: SongSnapshot,
  apiBase = "/api",
): Promise<ResolveResponseType> {
  const body: ResolveRequest = { snapshot };
  return fetchJson(`${apiBase}/play/resolve`, ResolveResponse, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
