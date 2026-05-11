import { ResolveResponse } from "@moc/contracts";
import type { ResolveRequest, SongSnapshot } from "@moc/contracts";
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

export interface PlayStartedBody {
  source: ProviderName;
  externalId: string;
  snapshot: SongSnapshot;
}

export interface PlayCompletedBody {
  source: ProviderName;
  externalId: string;
  snapshot: SongSnapshot;
  elapsedMs: number;
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
