import type { ResolveResponse, SongSnapshot } from "@moc/contracts";
import { reresolveStream } from "../playFetcher.js";

/**
 * Calls /play/reresolve with the given snapshot and currentSourceTrackId.
 * The response is validated against the ResolveResponse Zod schema inside
 * reresolveStream (via fetchJson). Propagates ZodError when the response
 * body does not conform, HttpError on non-2xx (401 when unauthenticated).
 */
export async function reresolveAndReplay(
  snapshot: SongSnapshot,
  currentSourceTrackId: string,
  apiBase = "/api",
): Promise<ResolveResponse> {
  return reresolveStream({ snapshot, currentSourceTrackId }, apiBase);
}
