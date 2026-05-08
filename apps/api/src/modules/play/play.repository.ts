import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import type { SongSnapshot } from "@moc/contracts";
import {
  PLAY_RESOLUTION_MODEL,
  RESOLUTION_TTL_MS,
  type PlayResolutionDocument,
} from "./play.schema.js";

export interface CachedResolution {
  source: "audius" | "soundcloud" | null;
  sourceTrackId: string | null;
}

@Injectable()
export class PlayRepository {
  constructor(
    @InjectModel(PLAY_RESOLUTION_MODEL) private readonly model: Model<PlayResolutionDocument>,
  ) {}

  async findByHash(snapshotHash: string): Promise<CachedResolution | null> {
    const doc = await this.model
      .findOne({ snapshotHash, expiresAt: { $gt: new Date() } })
      .lean()
      .exec();
    if (!doc) return null;
    return {
      source: (doc.source as CachedResolution["source"]) ?? null,
      sourceTrackId: doc.sourceTrackId ?? null,
    };
  }

  async save(
    snapshotHash: string,
    snapshot: SongSnapshot,
    source: "audius" | "soundcloud" | null,
    sourceTrackId: string | null,
  ): Promise<void> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + RESOLUTION_TTL_MS);
    await this.model
      .findOneAndUpdate(
        { snapshotHash },
        { snapshotHash, snapshot, source, sourceTrackId, resolvedAt: now, expiresAt },
        { upsert: true, new: true },
      )
      .lean()
      .exec();
  }
}
