import "reflect-metadata";
import { Module, RequestMethod, type INestApplication } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { APP_FILTER, APP_GUARD, NestFactory } from "@nestjs/core";
import cookieParser from "cookie-parser";
import type { HistoryEntry, HistoryResponse } from "@moc/contracts";

import { AllExceptionsFilter } from "../../../apps/api/src/common/all-exceptions.filter.js";
import { AuthGuard } from "../../../apps/api/src/common/auth.guard.js";
import { HealthController } from "../../../apps/api/src/health.controller.js";
import { AuthService } from "../../../apps/api/src/modules/auth/auth.service.js";
import { UsersRepository } from "../../../apps/api/src/modules/users/users.repository.js";
import { UsersService } from "../../../apps/api/src/modules/users/users.service.js";
import { SearchHistoryController } from "../../../apps/api/src/modules/search/search-history.controller.js";
import { SearchHistoryRepository } from "../../../apps/api/src/modules/search/search-history.repository.js";
import { FakeUsersRepository } from "./test-app.js";

export const HISTORY_TEST_ENV = {
  GOOGLE_CLIENT_ID: "test-google-client-id",
  GOOGLE_CLIENT_SECRET: "test-google-client-secret",
  GOOGLE_REDIRECT_URI: "http://localhost:5173/api/auth/google/callback",
  WEB_ORIGIN: "http://localhost:5173",
  SESSION_SECRET: "test-session-secret-32-bytes-for-history-tests",
  NODE_ENV: "test",
};

export class FakeSearchHistoryRepository {
  historyByUser: Map<string, HistoryEntry[]> = new Map();

  async upsert(_userId: string, _query: string): Promise<void> {}

  async findByUser(userId: string, limit: number, cursor?: string): Promise<HistoryResponse> {
    const allEntries = this.historyByUser.get(userId) ?? [];
    let filtered = allEntries;

    if (cursor) {
      try {
        const decoded = Buffer.from(cursor, "base64url").toString("utf8");
        const cursorDate = new Date(decoded);
        if (!isNaN(cursorDate.getTime())) {
          filtered = allEntries.filter((e) => new Date(e.lastSearchedAt) < cursorDate);
        }
      } catch {
        // Invalid cursor — use full list
      }
    }

    const effectiveLimit = Math.min(Math.max(limit, 1), 50);
    const page = filtered.slice(0, effectiveLimit);
    const hasMore = filtered.length > effectiveLimit;
    const lastItem = page.length > 0 ? page[page.length - 1] : undefined;
    const nextCursor =
      hasMore && lastItem
        ? Buffer.from(new Date(lastItem.lastSearchedAt).toISOString()).toString("base64url")
        : null;

    return { entries: page, nextCursor };
  }
}

const fakeHistoryRepoToken = Symbol.for("test:fake-history-repo");
const fakeUsersToken = Symbol.for("test:fake-users-repo-history");

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: true,
      load: [() => ({ ...HISTORY_TEST_ENV })],
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
  controllers: [SearchHistoryController, HealthController],
  providers: [
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
      provide: fakeHistoryRepoToken,
      useFactory: () => new FakeSearchHistoryRepository(),
    },
    {
      provide: SearchHistoryRepository,
      useFactory: (fake: FakeSearchHistoryRepository) => fake as unknown as SearchHistoryRepository,
      inject: [fakeHistoryRepoToken],
    },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
class TestSearchHistoryModule {}

export interface SearchHistoryTestAppHandle {
  app: INestApplication;
  historyRepo: FakeSearchHistoryRepository;
  authService: AuthService;
  env: typeof HISTORY_TEST_ENV;
}

export async function buildSearchHistoryTestApp(): Promise<SearchHistoryTestAppHandle> {
  const app = await NestFactory.create(TestSearchHistoryModule, { logger: false });
  app.use(cookieParser());
  app.setGlobalPrefix("api", {
    exclude: [{ path: "health", method: RequestMethod.GET }],
  });
  await app.init();

  const historyRepo = app.get<FakeSearchHistoryRepository>(fakeHistoryRepoToken);
  const authService = app.get(AuthService);

  return { app, historyRepo, authService, env: HISTORY_TEST_ENV };
}
