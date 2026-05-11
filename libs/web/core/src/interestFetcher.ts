import type { ExploredEventRequest, SavedEventRequest } from "@moc/contracts";

/**
 * Fire-and-forget POST helpers for the two interest-event routes.
 *
 * UI is optimistic; per the product spec, transient network failures
 * are silently dropped (no toast, no rollback). Returns void on
 * success and rejects on HTTP error so callers that want to log /
 * retry can opt in.
 */

async function postInterestEvent(
  path: "explored" | "saved",
  body: ExploredEventRequest | SavedEventRequest,
  apiBase = "/api",
): Promise<void> {
  const res = await fetch(`${apiBase}/search/${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`POST /search/${path} failed: ${res.status} ${res.statusText}`);
  }
}

export function recordExplored(body: ExploredEventRequest, apiBase = "/api"): Promise<void> {
  return postInterestEvent("explored", body, apiBase);
}

export function recordSaved(body: SavedEventRequest, apiBase = "/api"): Promise<void> {
  return postInterestEvent("saved", body, apiBase);
}
