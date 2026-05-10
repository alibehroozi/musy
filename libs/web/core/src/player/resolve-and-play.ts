import type { ResolveResponse, SongSnapshot } from "@moc/contracts";
import { resolveStream } from "../playFetcher.js";

/**
 * Calls /play/resolve with the given snapshot. The response is validated
 * against the ResolveResponse Zod schema inside resolveStream (via fetchJson).
 * Propagates ZodError when the response body does not conform.
 */
export async function resolveAndPlay(
  snapshot: SongSnapshot,
  apiBase = "/api",
): Promise<ResolveResponse> {
  return resolveStream({ snapshot }, apiBase);
}
