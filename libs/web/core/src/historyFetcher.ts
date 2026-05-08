import { HistoryResponse } from "@moc/contracts";
import { fetchJson } from "./fetcher.js";

export function getSearchHistory(cursor?: string, apiBase = "/api"): Promise<HistoryResponse> {
  const params = new URLSearchParams({ limit: "20" });
  if (cursor) params.set("cursor", cursor);
  return fetchJson(`${apiBase}/search/history?${params.toString()}`, HistoryResponse);
}
