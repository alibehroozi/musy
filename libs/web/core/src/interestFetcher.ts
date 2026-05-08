import type { ExploredEventRequest, SavedEventRequest } from "@moc/contracts";

async function postEvent(
  url: string,
  body: ExploredEventRequest | SavedEventRequest,
): Promise<void> {
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
}

export function recordExplored(body: ExploredEventRequest, apiBase = "/api"): Promise<void> {
  return postEvent(`${apiBase}/search/explored`, body);
}

export function recordSaved(body: SavedEventRequest, apiBase = "/api"): Promise<void> {
  return postEvent(`${apiBase}/search/saved`, body);
}
