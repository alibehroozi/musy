import { Schema, Document } from "mongoose";
import type { SearchResult, ProviderName } from "@moc/contracts";

export const SEARCH_CACHE_MODEL = "SearchCache";

export interface SearchCacheDocument extends Document {
  queryHash: string;
  query: string;
  results: SearchResult[];
  failedProviders: ProviderName[];
  expiresAt: Date;
}

export const SearchCacheSchemaDefinition = new Schema<SearchCacheDocument>(
  {
    queryHash: { type: String, required: true, unique: true, index: true },
    query: { type: String, required: true },
    results: { type: Schema.Types.Mixed, required: true, default: [] },
    failedProviders: { type: [String], required: true, default: [] },
    expiresAt: { type: Date, required: true },
  },
  { collection: "search_cache", versionKey: false },
);

// TTL index: MongoDB deletes documents when expiresAt is reached
SearchCacheSchemaDefinition.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
