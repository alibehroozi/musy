import { Inject, Injectable } from "@nestjs/common";
import type { TasteBucket, TasteBucketsResponse } from "@moc/contracts";
import { BucketsRepository } from "./buckets.repository.js";
import { BucketSongScoresRepository } from "./bucket-song-scores.repository.js";

@Injectable()
export class TasteService {
  constructor(
    @Inject(BucketsRepository) private readonly buckets: BucketsRepository,
    @Inject(BucketSongScoresRepository)
    private readonly bucketScores: BucketSongScoresRepository,
  ) {}

  /**
   * API-24: returns `{ buckets: [] }` for a user with no buckets — never
   * `null`, never an empty body. SEC-12: scope every read by the session's
   * userId.
   *
   * API-28: each bucket carries a server-computed `coverArtworkUrl`
   * derived from the highest-score `bucket_song_scores` row for the
   * `(userId, bucketId)` pair. The join is scoped per-user via the
   * repository's `userId`-filtered methods so user A's covers never leak
   * into user B's response.
   */
  async getProfile(userId: string): Promise<TasteBucketsResponse> {
    const buckets = await this.buckets.findForUser(userId);
    const enriched: TasteBucket[] = [];
    for (const bucket of buckets) {
      const coverArtworkUrl = await this.computeCoverArtworkUrl(userId, bucket.id);
      enriched.push({ ...bucket, coverArtworkUrl });
    }
    return { buckets: enriched };
  }

  /**
   * Compute the bucket's cover URL from the highest-scoring song. Ties on
   * `score` resolve to the lexicographically smallest `songKey` so the
   * choice is deterministic across requests. Returns `null` when no rows
   * exist, when the top row has no `coverUrl`, or when the value fails
   * URL parsing — a malformed historical row never 500s the profile
   * endpoint.
   */
  private async computeCoverArtworkUrl(userId: string, bucketId: string): Promise<string | null> {
    const rows = await this.bucketScores.findForUserBucket(userId, bucketId);
    if (rows.length === 0) return null;
    let top = rows[0]!;
    for (const row of rows) {
      if (row.score > top.score) {
        top = row;
      } else if (row.score === top.score && row.songKey < top.songKey) {
        top = row;
      }
    }
    const candidate = top.snapshot.coverUrl;
    if (typeof candidate !== "string" || candidate.length === 0) return null;
    try {
      new URL(candidate);
      return candidate;
    } catch {
      return null;
    }
  }
}
