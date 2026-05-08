import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import type { HistoryEntry, HistoryResponse } from "@moc/contracts";
import { SEARCH_HISTORY_MODEL, type SearchHistoryDocument } from "./search-history.schema.js";

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 20;

@Injectable()
export class SearchHistoryRepository {
  constructor(
    @InjectModel(SEARCH_HISTORY_MODEL) private readonly model: Model<SearchHistoryDocument>,
  ) {}

  async upsert(userId: string, query: string): Promise<void> {
    const now = new Date();
    await this.model
      .findOneAndUpdate(
        { userId, query },
        {
          $setOnInsert: { firstSearchedAt: now },
          $set: { lastSearchedAt: now },
          $inc: { searchCount: 1 },
        },
        { upsert: true, new: true },
      )
      .lean()
      .exec();
  }

  async findByUser(
    userId: string,
    limit: number = DEFAULT_LIMIT,
    cursor?: string,
  ): Promise<HistoryResponse> {
    const effectiveLimit = Math.min(Math.max(limit, 1), MAX_LIMIT);
    const filter: Record<string, unknown> = { userId };

    if (cursor) {
      try {
        const decoded = Buffer.from(cursor, "base64url").toString("utf8");
        const cursorDate = new Date(decoded);
        if (!isNaN(cursorDate.getTime())) {
          filter["lastSearchedAt"] = { $lt: cursorDate };
        }
      } catch {
        // Invalid cursor — restart from top
      }
    }

    const docs = await this.model
      .find(filter)
      .sort({ lastSearchedAt: -1 })
      .limit(effectiveLimit + 1)
      .lean()
      .exec();

    const hasMore = docs.length > effectiveLimit;
    const items = hasMore ? docs.slice(0, effectiveLimit) : docs;

    const lastItem = items.length > 0 ? items[items.length - 1] : undefined;
    const nextCursor =
      hasMore && lastItem
        ? Buffer.from(lastItem.lastSearchedAt.toISOString()).toString("base64url")
        : null;

    const entries: HistoryEntry[] = items.map((doc) => ({
      id: (doc._id as { toString(): string }).toString(),
      query: doc.query,
      lastSearchedAt: doc.lastSearchedAt.toISOString(),
      searchCount: doc.searchCount,
    }));

    return { entries, nextCursor };
  }
}
