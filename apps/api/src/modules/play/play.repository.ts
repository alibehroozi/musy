import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import type { ResolveSource, SongSnapshot } from "@moc/contracts";
import { PLAY_RESOLUTIONS_MODEL, type PlayResolutionsDocument } from "./play-resolutions.schema.js";

export const RESOLUTION_TTL_MS = 24 * 60 * 60 * 1000;

export interface CachedResolution {
  source: ResolveSource | null;
  sourceTrackId: string | null;
  sourceLocator: string | null;
}

@Injectable()
export class PlayRepository {
  constructor(
    @InjectModel(PLAY_RESOLUTIONS_MODEL)
    private readonly model: Model<PlayResolutionsDocument>,
  ) {}

  async findByHash(snapshotHash: string): Promise<CachedResolution | null> {
    const doc = await this.model
      .findOne({ snapshotHash, expiresAt: { $gt: new Date() } })
      .lean()
      .exec();
    if (!doc) return null;
    return {
      source: doc.source as ResolveSource | null,
      sourceTrackId: doc.sourceTrackId,
      sourceLocator: doc.sourceLocator,
    };
  }

  async save(
    snapshotHash: string,
    snapshot: SongSnapshot,
    cached: CachedResolution,
  ): Promise<void> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + RESOLUTION_TTL_MS);
    await this.model
      .findOneAndUpdate(
        { snapshotHash },
        {
          snapshotHash,
          snapshot,
          source: cached.source,
          sourceTrackId: cached.sourceTrackId,
          sourceLocator: cached.sourceLocator,
          resolvedAt: now,
          expiresAt,
        },
        { upsert: true, new: true },
      )
      .lean()
      .exec();
  }
}
