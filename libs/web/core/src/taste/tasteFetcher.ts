import {
  BucketDetailResponse,
  CustomMixCreatedResponse,
  TasteBucketsResponse,
} from "@moc/contracts";
import { fetchJson } from "../fetcher.js";

/**
 * GET /api/me/taste/profile — validates the response against
 * TasteBucketsResponse. Used by the `/taste` page to render the
 * bucket grid (feature 07) and to poll for `state: "building"`
 * transitions while a custom-mix or auto-bucket build is in flight.
 */
export function fetchTasteProfile(apiBase = "/api"): Promise<TasteBucketsResponse> {
  return fetchJson(`${apiBase}/me/taste/profile`, TasteBucketsResponse);
}

/**
 * POST /api/me/taste/custom-mix — request a custom mix from a free-text
 * prompt. The 200 response is returned synchronously in a microtask of
 * the pre-insert; the LLM build is fire-and-forget. The new bucket
 * appears in the next `fetchTasteProfile` call with `state: "building"`.
 *
 * Throws HttpError(422) when the user has no positive signal yet, 429
 * when 5 jobs are already in flight, or a generic HttpError on network
 * failure. The caller maps these into inline modal error copy
 * (see UI-35).
 */
export function requestCustomMix(
  promptText: string,
  apiBase = "/api",
): Promise<CustomMixCreatedResponse> {
  return fetchJson(`${apiBase}/me/taste/custom-mix`, CustomMixCreatedResponse, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ promptText }),
  });
}

/**
 * GET /api/me/taste/buckets/:bucketId — returns the full bucket plus
 * its song list sorted by score desc (API-29). Throws HttpError(404) when
 * the bucket doesn't exist or doesn't belong to the caller.
 */
export function fetchBucketDetail(
  bucketId: string,
  apiBase = "/api",
): Promise<BucketDetailResponse> {
  return fetchJson(`${apiBase}/me/taste/buckets/${bucketId}`, BucketDetailResponse);
}
