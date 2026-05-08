import { SearchResponse } from "@moc/contracts";
import { fetchJson } from "./fetcher.js";

/**
 * POST /api/search — validates response against SearchResponse Zod schema.
 * Accepts an optional apiBase so tests and apps can configure the endpoint.
 */
export function searchTracks(q: string, apiBase = "/api"): Promise<SearchResponse> {
  return fetchJson(`${apiBase}/search`, SearchResponse, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ q }),
  });
}
