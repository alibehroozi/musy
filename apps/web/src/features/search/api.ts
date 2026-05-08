import {
  searchTracks as searchTracksCore,
  getSearchHistory as getSearchHistoryCore,
  recordExplored as recordExploredCore,
  recordSaved as recordSavedCore,
} from "@moc/web-core";
import type {
  SearchResponse,
  HistoryResponse,
  ExploredEventRequest,
  SavedEventRequest,
} from "@moc/contracts";

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "/api";

export function searchTracks(q: string): Promise<SearchResponse> {
  return searchTracksCore(q, API_BASE);
}

export function getSearchHistory(cursor?: string): Promise<HistoryResponse> {
  return getSearchHistoryCore(cursor, API_BASE);
}

export function recordExplored(body: ExploredEventRequest): Promise<void> {
  return recordExploredCore(body, API_BASE);
}

export function recordSaved(body: SavedEventRequest): Promise<void> {
  return recordSavedCore(body, API_BASE);
}
