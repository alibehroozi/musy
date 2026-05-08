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
