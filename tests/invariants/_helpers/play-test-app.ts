import "reflect-metadata";
import { Module, RequestMethod, type INestApplication } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { APP_FILTER, APP_GUARD, NestFactory } from "@nestjs/core";
import cookieParser from "cookie-parser";
import type { SongSnapshot } from "@moc/contracts";

import { AllExceptionsFilter } from "../../../apps/api/src/common/all-exceptions.filter.js";
import { AuthGuard } from "../../../apps/api/src/common/auth.guard.js";
import { HealthController } from "../../../apps/api/src/health.controller.js";
import { AuthService } from "../../../apps/api/src/modules/auth/auth.service.js";
import { UsersRepository } from "../../../apps/api/src/modules/users/users.repository.js";
import { UsersService } from "../../../apps/api/src/modules/users/users.service.js";
import { PlayController } from "../../../apps/api/src/modules/play/play.controller.js";
import { PlayService } from "../../../apps/api/src/modules/play/play.service.js";
import { PlayRepository } from "../../../apps/api/src/modules/play/play.repository.js";
import { AudiusStreamClient } from "../../../apps/api/src/modules/play/providers/audius-stream.client.js";
import { SoundCloudStreamClient } from "../../../apps/api/src/modules/play/providers/soundcloud-stream.client.js";
import { PlayRateLimiterGuard } from "../../../apps/api/src/modules/play/play-rate-limiter.guard.js";
import type { CachedResolution } from "../../../apps/api/src/modules/play/play.repository.js";
import { FakeUsersRepository } from "./test-app.js";

export const PLAY_TEST_ENV = {
  AUDIUS_APP_NAME: "moc-test",
  SOUNDCLOUD_USER_AGENT: "test-ua-DO-NOT-LEAK",
  GOOGLE_CLIENT_ID: "test-google-client-id",
  GOOGLE_CLIENT_SECRET: "test-google-client-secret",
  GOOGLE_REDIRECT_URI: "http://localhost:5173/api/auth/google/callback",
  WEB_ORIGIN: "http://localhost:5173",
  SESSION_SECRET: "test-session-secret-32-bytes-for-play-tests",
  NODE_ENV: "test",
};

export class FakePlayRepository {
  cached: CachedResolution | null = null;
  saved: Array<{
    hash: string;
    snapshot: SongSnapshot;
    source: "audius" | "soundcloud" | null;
    sourceTrackId: string | null;
  }> = [];

  async findByHash(_hash: string): Promise<CachedResolution | null> {
    return this.cached;
  }

  async save(
    hash: string,
    snapshot: SongSnapshot,
    source: "audius" | "soundcloud" | null,
    sourceTrackId: string | null,
  ): Promise<void> {
    this.saved.push({ hash, snapshot, source, sourceTrackId });
  }
}

export class FakeAudiusStreamClient {
  resolvedTrackId: string | null = null;
  shouldFail = false;
  capturedHeaders: Record<string, string>[] = [];

  async resolveTrackId(
    _snapshot: Pick<SongSnapshot, "title" | "artist" | "durationSec">,
  ): Promise<string | null> {
    if (this.shouldFail) throw new Error("Audius failed");
    return this.resolvedTrackId;
  }

  getStreamUrl(sourceTrackId: string): string {
    return `https://api.audius.co/v1/tracks/${sourceTrackId}/stream?app_name=moc-test`;
  }
}

export class FakeSoundCloudStreamClient {
  result: { sourceTrackId: string; streamUrl: string } | null = null;
  shouldFail = false;

  async resolveStreamUrl(
    _snapshot: Pick<SongSnapshot, "title" | "artist">,
  ): Promise<{ sourceTrackId: string; streamUrl: string } | null> {
    if (this.shouldFail) throw new Error("SoundCloud failed");
    return this.result;
  }

  async fetchTrackPage(_url: string): Promise<{ sourceTrackId: string; streamUrl: string } | null> {
    if (this.shouldFail) throw new Error("SoundCloud failed");
    return this.result;
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
