import { Schema, Document } from "mongoose";

export const SEARCH_HISTORY_MODEL = "SearchHistory";

export interface SearchHistoryDocument extends Document {
  userId: string;
  query: string;
  firstSearchedAt: Date;
  lastSearchedAt: Date;
  searchCount: number;
}

export const SearchHistorySchemaDefinition = new Schema<SearchHistoryDocument>(
  {
    userId: { type: String, required: true },
    query: { type: String, required: true },
    firstSearchedAt: { type: Date, required: true },
    lastSearchedAt: { type: Date, required: true },
    searchCount: { type: Number, required: true, default: 1 },
  },
  { collection: "search_history", versionKey: false },
);

// Unique compound index — dedupes at the DB level (DATA-04)
SearchHistorySchemaDefinition.index({ userId: 1, query: 1 }, { unique: true });
// Range index for paginated history list sorted by most recent
SearchHistorySchemaDefinition.index({ userId: 1, lastSearchedAt: -1 });
