import "reflect-metadata";
import { Module, RequestMethod, type INestApplication } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { APP_FILTER, APP_GUARD, NestFactory } from "@nestjs/core";
import cookieParser from "cookie-parser";
import type { SearchResult, TrackResult, StationResult, ProviderName } from "@moc/contracts";

import { AllExceptionsFilter } from "../../../apps/api/src/common/all-exceptions.filter.js";
import { AuthGuard } from "../../../apps/api/src/common/auth.guard.js";
import { HealthController } from "../../../apps/api/src/health.controller.js";
import { AuthService } from "../../../apps/api/src/modules/auth/auth.service.js";
import { UsersRepository } from "../../../apps/api/src/modules/users/users.repository.js";
import { UsersService } from "../../../apps/api/src/modules/users/users.service.js";
import { SearchController } from "../../../apps/api/src/modules/search/search.controller.js";
import { SearchService } from "../../../apps/api/src/modules/search/search.service.js";
import {
  SearchRepository,
  type CachedSearchResult,
} from "../../../apps/api/src/modules/search/search.repository.js";
import { SearchHistoryRepository } from "../../../apps/api/src/modules/search/search-history.repository.js";
import { AudiusClient } from "../../../apps/api/src/modules/search/providers/audius.client.js";
import { DeezerClient } from "../../../apps/api/src/modules/search/providers/deezer.client.js";
import { RadioBrowserClient } from "../../../apps/api/src/modules/search/providers/radio-browser.client.js";
import { GeniusClient } from "../../../apps/api/src/modules/search/providers/genius.client.js";
import { SoundCloudClient } from "../../../apps/api/src/modules/search/providers/soundcloud.client.js";
import { SearchRateLimiterGuard } from "../../../apps/api/src/modules/search/search-rate-limiter.guard.js";
import { FakeUsersRepository } from "./test-app.js";

export const SEARCH_TEST_ENV = {
  GENIUS_ACCESS_TOKEN: "test-genius-token-DO-NOT-LEAK",
  AUDIUS_APP_NAME: "moc-test",
  GOOGLE_CLIENT_ID: "test-google-client-id",
  GOOGLE_CLIENT_SECRET: "test-google-client-secret",
  GOOGLE_REDIRECT_URI: "http://localhost:5173/api/auth/google/callback",
  WEB_ORIGIN: "http://localhost:5173",
  SESSION_SECRET: "test-session-secret-32-bytes-for-search-tests",
  SOUNDCLOUD_USER_AGENT: "test-soundcloud-ua-DO-NOT-LEAK",
  NODE_ENV: "test",
};

export class FakeSearchRepository {
  cachedResult: CachedSearchResult | null = null;
  saved: Array<{
    hash: string;
    query: string;
    results: SearchResult[];
    failedProviders: ProviderName[];
  }> = [];

  async findByHash(_hash: string): Promise<CachedSearchResult | null> {
    return this.cachedResult;
  }

  async save(
    hash: string,
    query: string,
    results: SearchResult[],
    failedProviders: ProviderName[],
  ): Promise<void> {
    this.saved.push({ hash, query, results, failedProviders });
  }
}

export class FakeAudiusClient {
  results: TrackResult[] = [];
  shouldFail = false;
  async search(_query: string): Promise<TrackResult[]> {
    if (this.shouldFail) throw new Error("Audius failed");
    return [...this.results];
  }
}

export class FakeDeezerClient {
  results: TrackResult[] = [];
  shouldFail = false;
  async search(_query: string): Promise<TrackResult[]> {
    if (this.shouldFail) throw new Error("Deezer failed");
    return [...this.results];
  }
}

export class FakeRadioBrowserClient {
  results: StationResult[] = [];
  shouldFail = false;
  async search(_query: string): Promise<StationResult[]> {
    if (this.shouldFail) throw new Error("RadioBrowser failed");
    return [...this.results];
  }
}

export class FakeGeniusClient {
  results: TrackResult[] = [];
  shouldFail = false;
  async search(_query: string): Promise<TrackResult[]> {
    if (this.shouldFail) throw new Error("Genius failed");
    return [...this.results];
  }
}

export class FakeSoundCloudClient {
  results: TrackResult[] = [];
  shouldFail = false;
  shouldHang = false;
  async search(_query: string): Promise<TrackResult[]> {
    if (this.shouldFail) throw new Error("SoundCloud failed");
    if (this.shouldHang) {
      await new Promise<never>(() => undefined);
    }
    return [...this.results];
  }
}

export class FakeSearchHistoryRepository {
  async upsert(_userId: string, _query: string): Promise<void> {}
  async findByUser(_userId: string, _limit: number, _cursor?: string) {
    return { entries: [], nextCursor: null };
  }
}

const fakeSearchRepoToken = Symbol.for("test:fake-search-repo");
const fakeHistoryRepoToken = Symbol.for("test:fake-history-repo-search");
const fakeAudiusToken = Symbol.for("test:fake-audius");
const fakeDeezerToken = Symbol.for("test:fake-deezer");
const fakeRadioBrowserToken = Symbol.for("test:fake-radio-browser");
const fakeGeniusToken = Symbol.for("test:fake-genius");
const fakeSoundCloudToken = Symbol.for("test:fake-soundcloud");
const fakeUsersToken = Symbol.for("test:fake-users-repo-search");

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: true,
      load: [() => ({ ...SEARCH_TEST_ENV })],
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
  controllers: [SearchController, HealthController],
  providers: [
    SearchService,
    SearchRateLimiterGuard,
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
      provide: fakeSearchRepoToken,
      useFactory: () => new FakeSearchRepository(),
    },
    {
      provide: SearchRepository,
      useFactory: (fake: FakeSearchRepository) => fake as unknown as SearchRepository,
      inject: [fakeSearchRepoToken],
    },
    {
      provide: fakeHistoryRepoToken,
      useFactory: () => new FakeSearchHistoryRepository(),
    },
    {
      provide: SearchHistoryRepository,
      useFactory: (fake: FakeSearchHistoryRepository) => fake as unknown as SearchHistoryRepository,
      inject: [fakeHistoryRepoToken],
    },
    {
      provide: fakeAudiusToken,
      useFactory: () => new FakeAudiusClient(),
    },
    {
      provide: AudiusClient,
      useFactory: (fake: FakeAudiusClient) => fake as unknown as AudiusClient,
      inject: [fakeAudiusToken],
    },
    {
      provide: fakeDeezerToken,
      useFactory: () => new FakeDeezerClient(),
    },
    {
      provide: DeezerClient,
      useFactory: (fake: FakeDeezerClient) => fake as unknown as DeezerClient,
      inject: [fakeDeezerToken],
    },
    {
      provide: fakeRadioBrowserToken,
      useFactory: () => new FakeRadioBrowserClient(),
    },
    {
      provide: RadioBrowserClient,
      useFactory: (fake: FakeRadioBrowserClient) => fake as unknown as RadioBrowserClient,
      inject: [fakeRadioBrowserToken],
    },
    {
      provide: fakeGeniusToken,
      useFactory: () => new FakeGeniusClient(),
    },
    {
      provide: GeniusClient,
      useFactory: (fake: FakeGeniusClient) => fake as unknown as GeniusClient,
      inject: [fakeGeniusToken],
    },
    {
      provide: fakeSoundCloudToken,
      useFactory: () => new FakeSoundCloudClient(),
    },
    {
      provide: SoundCloudClient,
      useFactory: (fake: FakeSoundCloudClient) => fake as unknown as SoundCloudClient,
      inject: [fakeSoundCloudToken],
    },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
class TestSearchModule {}

export interface SearchTestAppHandle {
  app: INestApplication;
  repo: FakeSearchRepository;
  audius: FakeAudiusClient;
  deezer: FakeDeezerClient;
  radioBrowser: FakeRadioBrowserClient;
  genius: FakeGeniusClient;
  soundcloud: FakeSoundCloudClient;
  env: typeof SEARCH_TEST_ENV;
}

export async function buildSearchTestApp(): Promise<SearchTestAppHandle> {
  const app = await NestFactory.create(TestSearchModule, { logger: false });
  app.use(cookieParser());
  app.setGlobalPrefix("api", {
    exclude: [{ path: "health", method: RequestMethod.GET }],
  });
  await app.init();

  const repo = app.get<FakeSearchRepository>(fakeSearchRepoToken);
  const audius = app.get<FakeAudiusClient>(fakeAudiusToken);
  const deezer = app.get<FakeDeezerClient>(fakeDeezerToken);
  const radioBrowser = app.get<FakeRadioBrowserClient>(fakeRadioBrowserToken);
  const genius = app.get<FakeGeniusClient>(fakeGeniusToken);
  const soundcloud = app.get<FakeSoundCloudClient>(fakeSoundCloudToken);

  return { app, repo, audius, deezer, radioBrowser, genius, soundcloud, env: SEARCH_TEST_ENV };
}
