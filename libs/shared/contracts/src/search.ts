import { z } from "zod";

export const ProviderName = z.enum(["audius", "deezer", "radio-browser", "genius"]);
export type ProviderName = z.infer<typeof ProviderName>;

export const TrackResult = z.object({
  type: z.literal("track"),
  id: z.string().min(1),
  title: z.string(),
  artist: z.string(),
  album: z.string().optional(),
  duration: z.number().optional(),
  artworkUrl: z.string().url().optional(),
  previewUrl: z.string().url().optional(),
  externalUrl: z.string().url().optional(),
  isrc: z.string().optional(),
  provider: ProviderName,
  providerId: z.string(),
  sources: z.array(ProviderName).min(1),
});
export type TrackResult = z.infer<typeof TrackResult>;

export const StationResult = z.object({
  type: z.literal("station"),
  id: z.string().min(1),
  name: z.string(),
  streamUrl: z.string().url().optional(),
  homepage: z.string().url().optional(),
  country: z.string().optional(),
  language: z.string().optional(),
  tags: z.array(z.string()).optional(),
  favicon: z.string().url().optional(),
  provider: z.literal("radio-browser"),
  providerId: z.string(),
  sources: z.array(ProviderName).min(1),
});
export type StationResult = z.infer<typeof StationResult>;

export const SearchResult = z.discriminatedUnion("type", [TrackResult, StationResult]);
export type SearchResult = z.infer<typeof SearchResult>;

export const SearchQuery = z.object({
  q: z.string().min(1, "Query must be non-empty"),
});
export type SearchQuery = z.infer<typeof SearchQuery>;

export const SearchResponse = z.object({
  results: z.array(SearchResult),
  partial: z.boolean(),
  failedProviders: z.array(ProviderName),
  cached: z.boolean(),
});
export type SearchResponse = z.infer<typeof SearchResponse>;

export const HistoryEntry = z.object({
  id: z.string().min(1),
  query: z.string(),
  lastSearchedAt: z.string().datetime(),
  searchCount: z.number().int().positive(),
});
export type HistoryEntry = z.infer<typeof HistoryEntry>;

export const HistoryResponse = z.object({
  entries: z.array(HistoryEntry),
  nextCursor: z.string().nullable(),
});
export type HistoryResponse = z.infer<typeof HistoryResponse>;

// ── Interest events (feature 05) ──────────────────────────────────────
//
// `interest_scores` stores one document per (userId, songKey) where
// songKey = `${source}:${externalId}`. The two POST endpoints share a
// request shape: a stable provider identity plus a snapshot of the
// song's public metadata. The snapshot is persisted on first event
// (DATA-07) so future epics can render saved songs without re-querying
// the providers (whose external IDs may be unstable).

export const SongKind = z.enum(["track", "station"]);
export type SongKind = z.infer<typeof SongKind>;

export const SongSnapshot = z.object({
  title: z.string().min(1),
  artist: z.string(),
  coverUrl: z.string().url().optional(),
  year: z.number().int().optional(),
  durationSec: z.number().int().nonnegative().optional(),
  kind: SongKind,
});
export type SongSnapshot = z.infer<typeof SongSnapshot>;

const InterestEventBody = z.object({
  source: ProviderName,
  externalId: z.string().min(1),
  snapshot: SongSnapshot,
});

export const ExploredEventRequest = InterestEventBody;
export type ExploredEventRequest = z.infer<typeof ExploredEventRequest>;

export const SavedEventRequest = InterestEventBody;
export type SavedEventRequest = z.infer<typeof SavedEventRequest>;

export const InterestEventType = z.enum(["explored", "saved"]);
export type InterestEventType = z.infer<typeof InterestEventType>;
