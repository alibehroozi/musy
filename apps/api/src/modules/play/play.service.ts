import { Injectable, Logger, Inject } from "@nestjs/common";
import type { ResolveResponse, SongSnapshot } from "@moc/contracts";
import { computeSnapshotHash, withTimeout } from "@moc/api-core";
import { AudiusStreamClient } from "./providers/audius-stream.client.js";
import { SoundCloudStreamClient } from "./providers/soundcloud-stream.client.js";
import { PlayRepository, type CachedResolution } from "./play.repository.js";

const PROVIDER_TIMEOUT_MS = 4_000;

const EMPTY_RESOLUTION: CachedResolution = {
  source: null,
  sourceTrackId: null,
  sourceLocator: null,
};

@Injectable()
export class PlayService {
  private readonly logger = new Logger(PlayService.name);

  constructor(
    @Inject(AudiusStreamClient) private readonly audius: AudiusStreamClient,
    @Inject(SoundCloudStreamClient) private readonly soundcloud: SoundCloudStreamClient,
    @Inject(PlayRepository) private readonly repository: PlayRepository,
  ) {}

  async resolve(snapshot: SongSnapshot): Promise<ResolveResponse> {
    const hash = computeSnapshotHash(snapshot);

    let cached = await this.repository.findByHash(hash);
    if (!cached) {
      cached = await this.lookup(snapshot);
      // Best-effort cache write — never fail the request on a cache write error.
      this.repository.save(hash, snapshot, cached).catch((err: unknown) => {
        this.logger.warn(`Cache write failed: ${String(err)}`);
      });
    }

    return await this.produceResponse(cached);
  }

  private async lookup(snapshot: SongSnapshot): Promise<CachedResolution> {
    try {
      const audiusMatch = await withTimeout(this.audius.findMatch(snapshot), PROVIDER_TIMEOUT_MS);
      if (audiusMatch) {
        return {
          source: "audius",
          sourceTrackId: audiusMatch.sourceTrackId,
          sourceLocator: audiusMatch.sourceLocator,
        };
      }
    } catch (err) {
      this.logger.warn(`Audius findMatch failed: ${String(err)}`);
    }

    try {
      const scMatch = await withTimeout(this.soundcloud.findMatch(snapshot), PROVIDER_TIMEOUT_MS);
      if (scMatch) {
        return {
          source: "soundcloud",
          sourceTrackId: scMatch.sourceTrackId,
          sourceLocator: scMatch.sourceLocator,
        };
      }
    } catch (err) {
      this.logger.warn(`SoundCloud findMatch failed: ${String(err)}`);
    }

    return EMPTY_RESOLUTION;
  }

  private async produceResponse(cached: CachedResolution): Promise<ResolveResponse> {
    if (cached.source === "audius" && cached.sourceLocator !== null) {
      const result = this.audius.produceStreamUrl(cached.sourceLocator);
      return {
        source: "audius",
        sourceTrackId: cached.sourceTrackId,
        streamUrl: result.streamUrl,
        expiresAt: result.expiresAt,
      };
    }
    if (cached.source === "soundcloud" && cached.sourceLocator !== null) {
      try {
        const result = await withTimeout(
          this.soundcloud.produceStreamUrl(cached.sourceLocator),
          PROVIDER_TIMEOUT_MS,
        );
        if (result) {
          return {
            source: "soundcloud",
            sourceTrackId: cached.sourceTrackId,
            streamUrl: result.streamUrl,
            expiresAt: result.expiresAt,
          };
        }
      } catch (err) {
        this.logger.warn(`SoundCloud produceStreamUrl failed: ${String(err)}`);
      }
    }
    return { source: null, sourceTrackId: null, streamUrl: null, expiresAt: null };
  }
}
