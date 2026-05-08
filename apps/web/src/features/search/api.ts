import {
  searchTracks as searchTracksCore,
  getSearchHistory as getSearchHistoryCore,
} from "@moc/web-core";
import type { SearchResponse, HistoryResponse } from "@moc/contracts";

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "/api";

export function searchTracks(q: string): Promise<SearchResponse> {
  return searchTracksCore(q, API_BASE);
}

export function getSearchHistory(cursor?: string): Promise<HistoryResponse> {
  return getSearchHistoryCore(cursor, API_BASE);
}
