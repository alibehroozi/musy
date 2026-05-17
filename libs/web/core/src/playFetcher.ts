import { ResolveResponse } from "@moc/contracts";
import type { ReresolveRequest, ResolveRequest, SongSnapshot } from "@moc/contracts";
import type { ProviderName } from "@moc/contracts";
import { fetchJson, HttpError } from "./fetcher.js";

export async function resolveStream(
  body: ResolveRequest,
  apiBase = "/api",
): Promise<import("@moc/contracts").ResolveResponse> {
  return fetchJson(`${apiBase}/play/resolve`, ResolveResponse, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function reresolveStream(
  body: ReresolveRequest,
  apiBase = "/api",
): Promise<import("@moc/contracts").ResolveResponse> {
  return fetchJson(`${apiBase}/play/reresolve`, ResolveResponse, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export interface PlayStartedBody {
  source: ProviderName;
  externalId: string;
  snapshot: SongSnapshot;
  /**
   * Optional bucket origin context — present when the play started from
   * a bucket detail page (feature 08). Feature 06's skip-attribution
   * reads these on the server side to scope the `bucket_song_scores`
   * decrement to the originating bucket.
   *
   * Either both null or both non-null per DATA-21; omit both when the
   * play originated outside a bucket.
   */
  bucketId?: string;
  bucketKind?: "auto" | "custom";
}

export interface PlayCompletedBody {
  source: ProviderName;
  externalId: string;
  snapshot: SongSnapshot;
  elapsedMs: number;
  bucketId?: string;
  bucketKind?: "auto" | "custom";
}

export async function recordPlayStarted(body: PlayStartedBody, apiBase = "/api"): Promise<void> {
  const res = await fetch(`${apiBase}/play/started`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new HttpError(res.status, res.statusText, `${apiBase}/play/started`);
  }
}

export async function recordPlayCompleted(
  body: PlayCompletedBody,
  apiBase = "/api",
): Promise<void> {
  const res = await fetch(`${apiBase}/play/completed`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new HttpError(res.status, res.statusText, `${apiBase}/play/completed`);
  }
}
