import { searchTracks as searchTracksCore } from "@moc/web-core";
import type { SearchResponse } from "@moc/contracts";

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "/api";

export function searchTracks(q: string): Promise<SearchResponse> {
  return searchTracksCore(q, API_BASE);
}
