import {
  fetchTasteProfile as fetchTasteProfileCore,
  requestCustomMix as requestCustomMixCore,
} from "@moc/web-core";
import type { CustomMixCreatedResponse, TasteBucketsResponse } from "@moc/contracts";

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "/api";

export function fetchTasteProfile(): Promise<TasteBucketsResponse> {
  return fetchTasteProfileCore(API_BASE);
}

export function requestCustomMix(promptText: string): Promise<CustomMixCreatedResponse> {
  return requestCustomMixCore(promptText, API_BASE);
}
