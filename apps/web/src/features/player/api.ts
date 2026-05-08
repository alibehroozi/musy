import type { SongSnapshot, PlayStartedRequest, PlayCompletedRequest } from "@moc/contracts";
import { resolveAndPlay as resolveAndPlayCore } from "@moc/web-core";
import type { ResolveResponse } from "@moc/contracts";

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "/api";

export function resolveStream(snapshot: SongSnapshot): Promise<ResolveResponse> {
  return resolveAndPlayCore(snapshot, API_BASE);
}

export function recordStarted(
  source: string,
  externalId: string,
  snapshot: SongSnapshot,
): Promise<void> {
  const body: PlayStartedRequest = {
    source: source as PlayStartedRequest["source"],
    externalId,
    snapshot,
  };
  return fetch(`${API_BASE}/play/started`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  }).then(() => undefined);
}

export function recordCompleted(
  source: string,
  externalId: string,
  snapshot: SongSnapshot,
  elapsedMs: number,
): Promise<void> {
  const body: PlayCompletedRequest = {
    source: source as PlayCompletedRequest["source"],
    externalId,
    snapshot,
    elapsedMs,
  };
  return fetch(`${API_BASE}/play/completed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  }).then(() => undefined);
}
