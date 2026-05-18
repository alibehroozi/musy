import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type {
  BucketDetailResponse,
  BucketDetailSong,
  TasteBucket,
  TasteBucketsResponse,
} from "@moc/contracts";
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

  /**
   * API-29 / SEC-18: bucket detail by id, scoped to the caller's userId.
   *
   * The bucket lookup uses a `(userId, bucketId)` filter so a row owned
   * by another user never matches — collapses to NotFound, which the
   * AllExceptionsFilter renders as 404 + ErrorResponse with a stable
   * body (no oracle distinguishing "absent" from "owned-by-other").
   *
   * Only after the bucket lookup succeeds does the song-list join fire;
   * a missed lookup short-circuits before any `bucket_song_scores` read,
   * so a probing client cannot trigger that read against an unscoped id.
   *
   * `songs` is server-sorted by `score` desc; ties on `score` break by
   * `lastUpdatedAt` desc (more recently scored first), then by
   * lexicographically ascending `songKey` so the order is deterministic
   * across reloads (LOGIC-40 owns the comparator; this mirrors it).
   */
  async getBucketDetail(userId: string, bucketId: string): Promise<BucketDetailResponse> {
    const bucket = await this.buckets.findByIdForUser(userId, bucketId);
    if (bucket === null) {
      throw new NotFoundException("Bucket not found");
    }
    const coverArtworkUrl = await this.computeCoverArtworkUrl(userId, bucketId);
    const rows = await this.bucketScores.findForUserBucket(userId, bucketId);
    const sorted = [...rows].sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      const aTime = a.lastUpdatedAt instanceof Date ? a.lastUpdatedAt.getTime() : 0;
      const bTime = b.lastUpdatedAt instanceof Date ? b.lastUpdatedAt.getTime() : 0;
      if (aTime !== bTime) return bTime - aTime;
      return a.songKey < b.songKey ? -1 : a.songKey > b.songKey ? 1 : 0;
    });
    const songs: BucketDetailSong[] = sorted.map((row) => ({
      songKey: row.songKey,
      snapshot: row.snapshot,
      score: row.score,
    }));
    return {
      bucket: { ...bucket, coverArtworkUrl },
      songs,
    };
  }
}
