import "reflect-metadata";
import { Module, RequestMethod, type INestApplication } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { APP_FILTER, APP_GUARD, NestFactory } from "@nestjs/core";
import cookieParser from "cookie-parser";
import type { TasteBucket } from "@moc/contracts";

import { AllExceptionsFilter } from "../../../apps/api/src/common/all-exceptions.filter.js";
import { AuthGuard } from "../../../apps/api/src/common/auth.guard.js";
import { HealthController } from "../../../apps/api/src/health.controller.js";
import { AuthService } from "../../../apps/api/src/modules/auth/auth.service.js";
import { UsersRepository } from "../../../apps/api/src/modules/users/users.repository.js";
import { UsersService } from "../../../apps/api/src/modules/users/users.service.js";
import { TasteController } from "../../../apps/api/src/modules/taste/taste.controller.js";
import { TasteService } from "../../../apps/api/src/modules/taste/taste.service.js";
import { BucketsRepository } from "../../../apps/api/src/modules/taste/buckets.repository.js";
import { BucketSongScoresRepository } from "../../../apps/api/src/modules/taste/bucket-song-scores.repository.js";
import type { BucketSongScoresDocument } from "../../../apps/api/src/modules/taste/bucket-song-scores.schema.js";
import { FakeUsersRepository } from "./test-app.js";

const TASTE_TEST_ENV = {
  GOOGLE_CLIENT_ID: "test-google-client-id",
  GOOGLE_CLIENT_SECRET: "test-google-client-secret",
  GOOGLE_REDIRECT_URI: "http://localhost:5173/api/auth/google/callback",
  WEB_ORIGIN: "http://localhost:5173",
  SESSION_SECRET: "test-session-secret-32-bytes-taste-buckets-aaa",
  NODE_ENV: "test",
};

/**
 * In-memory stand-in for BucketsRepository. The taste tests prime
 * `bucketsByUser` directly to assert SEC-12 / API-24 without spinning
 * a real Mongo.
 */
export class FakeBucketsRepository {
  bucketsByUser = new Map<string, TasteBucket[]>();
  readUserIds: string[] = [];
  /** Tracks every call to findByIdForUser (SEC-18 assertions). */
  byIdCalls: Array<{ userId: string; bucketId: string }> = [];

  async findForUser(userId: string): Promise<TasteBucket[]> {
    this.readUserIds.push(userId);
    return [...(this.bucketsByUser.get(userId) ?? [])];
  }

  async findByIdForUser(userId: string, bucketId: string): Promise<TasteBucket | null> {
    this.byIdCalls.push({ userId, bucketId });
    const list = this.bucketsByUser.get(userId) ?? [];
    return list.find((b) => b.id === bucketId) ?? null;
  }
}

/**
 * In-memory stand-in for BucketSongScoresRepository — the read path the
 * profile endpoint uses to compute API-28's `coverArtworkUrl`. Tests
 * prime `rowsByUserAndBucket` with sparse rows; everything else is
 * irrelevant to the profile read.
 */
export class FakeBucketSongScoresRepository {
  rowsByUserAndBucket = new Map<string, BucketSongScoresDocument[]>();
  /** Tracks every call to findForUserBucket (SEC-18 assertions). */
  readCalls: Array<{ userId: string; bucketId: string }> = [];

  async findForUserBucket(userId: string, bucketId: string): Promise<BucketSongScoresDocument[]> {
    const key = `${userId}::${bucketId}`;
    this.readCalls.push({ userId, bucketId });
    return [...(this.rowsByUserAndBucket.get(key) ?? [])];
  }

  setRows(userId: string, bucketId: string, rows: BucketSongScoresDocument[]): void {
    this.rowsByUserAndBucket.set(`${userId}::${bucketId}`, rows);
  }
}

const fakeUsersToken = Symbol.for("test:fake-users-repo-taste");
const fakeBucketsRepoToken = Symbol.for("test:fake-buckets-repo");
const fakeBucketSongScoresRepoToken = Symbol.for("test:fake-bucket-song-scores-repo");

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: true,
      load: [() => ({ ...TASTE_TEST_ENV })],
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
  controllers: [TasteController, HealthController],
  providers: [
    TasteService,
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
      provide: fakeBucketsRepoToken,
      useFactory: () => new FakeBucketsRepository(),
    },
    {
      provide: BucketsRepository,
      useFactory: (fake: FakeBucketsRepository) => fake as unknown as BucketsRepository,
      inject: [fakeBucketsRepoToken],
    },
    {
      provide: fakeBucketSongScoresRepoToken,
      useFactory: () => new FakeBucketSongScoresRepository(),
    },
    {
      provide: BucketSongScoresRepository,
      useFactory: (fake: FakeBucketSongScoresRepository) =>
        fake as unknown as BucketSongScoresRepository,
      inject: [fakeBucketSongScoresRepoToken],
    },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
class TestTasteModule {}

export interface TasteTestAppHandle {
  app: INestApplication;
  bucketsRepo: FakeBucketsRepository;
  bucketSongScoresRepo: FakeBucketSongScoresRepository;
  authService: AuthService;
  env: typeof TASTE_TEST_ENV;
}

export async function buildTasteTestApp(): Promise<TasteTestAppHandle> {
  const app = await NestFactory.create(TestTasteModule, { logger: false });
  app.use(cookieParser());
  app.setGlobalPrefix("api", {
    exclude: [{ path: "health", method: RequestMethod.GET }],
  });
  await app.init();

  const bucketsRepo = app.get<FakeBucketsRepository>(fakeBucketsRepoToken);
  const bucketSongScoresRepo = app.get<FakeBucketSongScoresRepository>(
    fakeBucketSongScoresRepoToken,
  );
  const authService = app.get(AuthService);
  return {
    app,
    bucketsRepo,
    bucketSongScoresRepo,
    authService,
    env: TASTE_TEST_ENV,
  };
}

export function makeBucket(overrides: Partial<TasteBucket> = {}): TasteBucket {
  return {
    id: overrides.id ?? "b-550e8400-e29b-41d4-a716-446655440000",
    userId: overrides.userId ?? "550e8400-e29b-41d4-a716-446655440000",
    name: overrides.name ?? "Late-night drives",
    description: overrides.description ?? null,
    kind: overrides.kind ?? "auto",
    state: overrides.state ?? "ready",
    promptText: overrides.promptText ?? null,
    errorReason: overrides.errorReason ?? null,
    createdAt: overrides.createdAt ?? "2026-05-15T10:00:00.000Z",
    lastBuiltAt: overrides.lastBuiltAt ?? "2026-05-17T08:00:00.000Z",
    coverArtworkUrl: overrides.coverArtworkUrl ?? null,
  };
}
