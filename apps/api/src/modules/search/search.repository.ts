import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import type { SearchResult, ProviderName } from "@moc/contracts";
import { SEARCH_CACHE_MODEL, type SearchCacheDocument } from "./search-cache.schema.js";

export const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export interface CachedSearchResult {
  results: SearchResult[];
  failedProviders: ProviderName[];
}

@Injectable()
export class SearchRepository {
  constructor(
    @InjectModel(SEARCH_CACHE_MODEL) private readonly model: Model<SearchCacheDocument>,
  ) {}

  async findByHash(queryHash: string): Promise<CachedSearchResult | null> {
    const doc = await this.model
      .findOne({ queryHash, expiresAt: { $gt: new Date() } })
      .lean()
      .exec();
    if (!doc) return null;
    return {
      results: doc.results as SearchResult[],
      failedProviders: doc.failedProviders as ProviderName[],
    };
  }

  async save(
    queryHash: string,
    query: string,
    results: SearchResult[],
    failedProviders: ProviderName[],
  ): Promise<void> {
    const expiresAt = new Date(Date.now() + CACHE_TTL_MS);
    await this.model
      .findOneAndUpdate(
        { queryHash },
        { queryHash, query, results, failedProviders, expiresAt },
        { upsert: true, new: true },
      )
      .lean()
      .exec();
  }
}
