import { Injectable, Logger, Inject } from "@nestjs/common";
import type { ResolveResponse, SongSnapshot } from "@moc/contracts";
import { computeSnapshotHash } from "@moc/api-core";
import { AudiusStreamClient } from "./providers/audius-stream.client.js";
import { SoundCloudStreamClient } from "./providers/soundcloud-stream.client.js";
import { PlayRepository } from "./play.repository.js";

const PROVIDER_TIMEOUT_MS = 4_000;

@Injectable()
export class PlayService {
  private readonly logger = new Logger(PlayService.name);

  constructor(
    @Inject(AudiusStreamClient) private readonly audiusClient: AudiusStreamClient,
    @Inject(SoundCloudStreamClient) private readonly soundcloudClient: SoundCloudStreamClient,
    @Inject(PlayRepository) private readonly repository: PlayRepository,
  ) {}

  async resolve(snapshot: SongSnapshot): Promise<ResolveResponse> {
    const hash = computeSnapshotHash(snapshot);
    const cached = await this.repository.findByHash(hash);

    if (cached) {
      return this.produceStreamUrl(cached.source, cached.sourceTrackId, snapshot);
    }

    return this.resolveFromProviders(snapshot, hash);
  }

  private async resolveFromProviders(
    snapshot: SongSnapshot,
    hash: string,
  ): Promise<ResolveResponse> {
    // Try Audius first
    let audiusTrackId: string | null = null;
    try {
      audiusTrackId = await withTimeout(
        this.audiusClient.resolveTrackId(snapshot),
        PROVIDER_TIMEOUT_MS,
      );
    } catch (err) {
      this.logger.warn(`Audius resolve failed: ${String(err)}`);
    }

    if (audiusTrackId) {
      this.saveCache(hash, snapshot, "audius", audiusTrackId);
      const streamUrl = this.audiusClient.getStreamUrl(audiusTrackId);
      return { source: "audius", sourceTrackId: audiusTrackId, streamUrl, expiresAt: null };
    }

    // Fallback to SoundCloud
    let scResult: { sourceTrackId: string; streamUrl: string } | null = null;
    try {
      scResult = await withTimeout(
        this.soundcloudClient.resolveStreamUrl(snapshot),
        PROVIDER_TIMEOUT_MS,
      );
    } catch (err) {
      this.logger.warn(`SoundCloud resolve failed: ${String(err)}`);
    }

    if (scResult) {
      this.saveCache(hash, snapshot, "soundcloud", scResult.sourceTrackId);
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // ~1h
      return {
        source: "soundcloud",
        sourceTrackId: scResult.sourceTrackId,
        streamUrl: scResult.streamUrl,
        expiresAt,
      };
    }

    this.saveCache(hash, snapshot, null, null);
    return { source: null, sourceTrackId: null, streamUrl: null, expiresAt: null };
  }

  private async produceStreamUrl(
    source: "audius" | "soundcloud" | null,
    sourceTrackId: string | null,
    snapshot: SongSnapshot,
  ): Promise<ResolveResponse> {
    if (!source || !sourceTrackId) {
      return { source: null, sourceTrackId: null, streamUrl: null, expiresAt: null };
    }

    if (source === "audius") {
      const streamUrl = this.audiusClient.getStreamUrl(sourceTrackId);
      return { source: "audius", sourceTrackId, streamUrl, expiresAt: null };
    }

    // SoundCloud: re-fetch fresh stream URL from cached track ID
    try {
      const result = await withTimeout(
        this.soundcloudClient.fetchTrackPage(
          `https://soundcloud.com/search/sounds?q=${encodeURIComponent(`${snapshot.title} ${snapshot.artist}`)}`,
        ),
        PROVIDER_TIMEOUT_MS,
      );
      if (result) {
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
        return { source: "soundcloud", sourceTrackId, streamUrl: result.streamUrl, expiresAt };
      }
    } catch (err) {
      this.logger.warn(`SoundCloud re-resolve failed: ${String(err)}`);
    }

    return { source: null, sourceTrackId: null, streamUrl: null, expiresAt: null };
  }

  private saveCache(
    hash: string,
    snapshot: SongSnapshot,
    source: "audius" | "soundcloud" | null,
    sourceTrackId: string | null,
  ): void {
    this.repository.save(hash, snapshot, source, sourceTrackId).catch((err: unknown) => {
      this.logger.warn(`Cache write failed: ${String(err)}`);
    });
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}
