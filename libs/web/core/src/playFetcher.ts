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
  /** Present when play originates from a bucket (feature 08 / SEC-17). */
  bucketId?: string | null;
  bucketKind?: "auto" | "custom" | null;
}

export interface PlayCompletedBody {
  source: ProviderName;
  externalId: string;
  snapshot: SongSnapshot;
  elapsedMs: number;
  /** Present when play originates from a bucket (feature 08 / SEC-17). */
  bucketId?: string | null;
  bucketKind?: "auto" | "custom" | null;
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
