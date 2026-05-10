import "reflect-metadata";
import { Module, RequestMethod, type INestApplication } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { APP_FILTER, APP_GUARD, NestFactory } from "@nestjs/core";
import cookieParser from "cookie-parser";
import type { ResolveSource, SongSnapshot } from "@moc/contracts";

import { AllExceptionsFilter } from "../../../apps/api/src/common/all-exceptions.filter.js";
import { AuthGuard } from "../../../apps/api/src/common/auth.guard.js";
import { HealthController } from "../../../apps/api/src/health.controller.js";
import { AuthService } from "../../../apps/api/src/modules/auth/auth.service.js";
import { UsersRepository } from "../../../apps/api/src/modules/users/users.repository.js";
import { UsersService } from "../../../apps/api/src/modules/users/users.service.js";
import { PlayController } from "../../../apps/api/src/modules/play/play.controller.js";
import { PlayService } from "../../../apps/api/src/modules/play/play.service.js";
import {
  PlayRepository,
  type CachedResolution,
} from "../../../apps/api/src/modules/play/play.repository.js";
import { PlayRateLimiterGuard } from "../../../apps/api/src/modules/play/play-rate-limiter.guard.js";
import {
  AudiusStreamClient,
  type AudiusFindResult,
  type AudiusStreamUrlResult,
} from "../../../apps/api/src/modules/play/providers/audius-stream.client.js";
import {
  SoundCloudStreamClient,
  type SoundCloudFindResult,
  type SoundCloudStreamUrlResult,
} from "../../../apps/api/src/modules/play/providers/soundcloud-stream.client.js";
import { FakeUsersRepository } from "./test-app.js";

export const PLAY_TEST_ENV = {
  AUDIUS_APP_NAME: "moc-test",
  SOUNDCLOUD_USER_AGENT: "test-soundcloud-ua-DO-NOT-LEAK",
  GOOGLE_CLIENT_ID: "test-google-client-id",
  GOOGLE_CLIENT_SECRET: "test-google-client-secret",
  GOOGLE_REDIRECT_URI: "http://localhost:5173/api/auth/google/callback",
  WEB_ORIGIN: "http://localhost:5173",
  SESSION_SECRET: "test-session-secret-32-bytes-for-play-tests-aaaa",
  NODE_ENV: "test",
};

export class FakePlayRepository {
  store = new Map<string, CachedResolution & { snapshot: SongSnapshot }>();
  saved: Array<{ snapshotHash: string; snapshot: SongSnapshot; cached: CachedResolution }> = [];

  async findByHash(snapshotHash: string): Promise<CachedResolution | null> {
    const found = this.store.get(snapshotHash);
    if (!found) return null;
    return {
      source: found.source,
      sourceTrackId: found.sourceTrackId,
      sourceLocator: found.sourceLocator,
    };
  }

  async save(
    snapshotHash: string,
    snapshot: SongSnapshot,
    cached: CachedResolution,
  ): Promise<void> {
    this.saved.push({ snapshotHash, snapshot, cached });
    this.store.set(snapshotHash, { ...cached, snapshot });
  }
}

export class FakeAudiusStreamClient {
  match: AudiusFindResult | null = null;
  shouldFailFind = false;
  findCalls: SongSnapshot[] = [];
  produceCalls: string[] = [];

  async findMatch(snapshot: SongSnapshot): Promise<AudiusFindResult | null> {
    this.findCalls.push(snapshot);
    if (this.shouldFailFind) throw new Error("Audius failed");
    return this.match;
  }

  produceStreamUrl(sourceLocator: string): AudiusStreamUrlResult {
    this.produceCalls.push(sourceLocator);
    return {
      streamUrl: `https://audius.example/stream/${sourceLocator}`,
      expiresAt: null,
    };
  }
}

export class FakeSoundCloudStreamClient {
  match: SoundCloudFindResult | null = null;
  matchQueue: Array<SoundCloudFindResult | null> = [];
  shouldFailFind = false;
  produceResult: SoundCloudStreamUrlResult | null = null;
  produceByLocator = new Map<string, SoundCloudStreamUrlResult | null>();
  shouldFailProduce = false;
  findCalls: SongSnapshot[] = [];
  produceCalls: string[] = [];

  async findMatch(snapshot: SongSnapshot): Promise<SoundCloudFindResult | null> {
    this.findCalls.push(snapshot);
    if (this.shouldFailFind) throw new Error("SoundCloud findMatch failed");
    if (this.matchQueue.length > 0) return this.matchQueue.shift() ?? null;
    return this.match;
  }

  async produceStreamUrl(sourceLocator: string): Promise<SoundCloudStreamUrlResult | null> {
    this.produceCalls.push(sourceLocator);
    if (this.shouldFailProduce) throw new Error("SoundCloud produceStreamUrl failed");
    if (this.produceByLocator.has(sourceLocator)) {
      return this.produceByLocator.get(sourceLocator) ?? null;
    }
    return this.produceResult;
  }
}

const fakePlayRepoToken = Symbol.for("test:fake-play-repo");
const fakeAudiusToken = Symbol.for("test:fake-audius-stream");
const fakeSoundCloudToken = Symbol.for("test:fake-soundcloud-stream");
const fakeUsersToken = Symbol.for("test:fake-users-repo-play");

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: true,
      load: [() => ({ ...PLAY_TEST_ENV })],
    }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>("SESSION_SECRET"),
        signOptions: { expiresIn: "7d" },
      }),
    }),
  ],
  controllers: [PlayController, HealthController],
  providers: [
    PlayService,
    PlayRateLimiterGuard,
    AuthService,
    UsersService,
    {
      provide: fakeUsersToken,
      useFactory: () => new FakeUsersRepository(),
    },
    {
      provide: UsersRepository,
      useFactory: (fake: FakeUsersRepository) => fake as unknown as UsersRepository,
      inject: [fakeUsersToken],
    },
    {
      provide: fakePlayRepoToken,
      useFactory: () => new FakePlayRepository(),
    },
    {
      provide: PlayRepository,
      useFactory: (fake: FakePlayRepository) => fake as unknown as PlayRepository,
      inject: [fakePlayRepoToken],
    },
    {
      provide: fakeAudiusToken,
      useFactory: () => new FakeAudiusStreamClient(),
    },
    {
      provide: AudiusStreamClient,
      useFactory: (fake: FakeAudiusStreamClient) => fake as unknown as AudiusStreamClient,
      inject: [fakeAudiusToken],
    },
    {
      provide: fakeSoundCloudToken,
      useFactory: () => new FakeSoundCloudStreamClient(),
    },
    {
      provide: SoundCloudStreamClient,
      useFactory: (fake: FakeSoundCloudStreamClient) => fake as unknown as SoundCloudStreamClient,
      inject: [fakeSoundCloudToken],
    },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
class TestPlayModule {}

export interface PlayTestAppHandle {
  app: INestApplication;
  repo: FakePlayRepository;
  audius: FakeAudiusStreamClient;
  soundcloud: FakeSoundCloudStreamClient;
  env: typeof PLAY_TEST_ENV;
}

export async function buildPlayTestApp(): Promise<PlayTestAppHandle> {
  const app = await NestFactory.create(TestPlayModule, { logger: false });
  app.use(cookieParser());
  app.setGlobalPrefix("api", {
    exclude: [{ path: "health", method: RequestMethod.GET }],
  });
  await app.init();

  const repo = app.get<FakePlayRepository>(fakePlayRepoToken);
  const audius = app.get<FakeAudiusStreamClient>(fakeAudiusToken);
  const soundcloud = app.get<FakeSoundCloudStreamClient>(fakeSoundCloudToken);

  return { app, repo, audius, soundcloud, env: PLAY_TEST_ENV };
}

export function makeSnapshot(overrides: Partial<SongSnapshot> = {}): SongSnapshot {
  return {
    title: overrides.title ?? "Get Lucky",
    artist: overrides.artist ?? "Daft Punk",
    kind: overrides.kind ?? "track",
    ...(overrides.coverUrl !== undefined ? { coverUrl: overrides.coverUrl } : {}),
    ...(overrides.year !== undefined ? { year: overrides.year } : {}),
    ...(overrides.durationSec !== undefined ? { durationSec: overrides.durationSec } : {}),
  };
}

export type { ResolveSource };
