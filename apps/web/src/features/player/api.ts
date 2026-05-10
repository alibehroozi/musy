import {
  resolveStream as resolveStreamCore,
  recordPlayStarted as recordPlayStartedCore,
  recordPlayCompleted as recordPlayCompletedCore,
} from "@moc/web-core";
import type { PlayCompletedBody, PlayStartedBody } from "@moc/web-core";
import type { ResolveRequest, ResolveResponse } from "@moc/contracts";

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "/api";

export function resolveStream(body: ResolveRequest): Promise<ResolveResponse> {
  return resolveStreamCore(body, API_BASE);
}

export function recordPlayStarted(body: PlayStartedBody): Promise<void> {
  return recordPlayStartedCore(body, API_BASE);
}

export function recordPlayCompleted(body: PlayCompletedBody): Promise<void> {
  return recordPlayCompletedCore(body, API_BASE);
}
