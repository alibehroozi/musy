import "reflect-metadata";
import { Module, RequestMethod, type INestApplication } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { APP_FILTER, APP_GUARD, NestFactory } from "@nestjs/core";
import cookieParser from "cookie-parser";
import type { SongSnapshot, TasteBucket } from "@moc/contracts";

import { AllExceptionsFilter } from "../../../apps/api/src/common/all-exceptions.filter.js";
import { AuthGuard } from "../../../apps/api/src/common/auth.guard.js";
import { AuthService } from "../../../apps/api/src/modules/auth/auth.service.js";
import { UsersRepository } from "../../../apps/api/src/modules/users/users.repository.js";
import { UsersService } from "../../../apps/api/src/modules/users/users.service.js";
import { CustomMixController } from "../../../apps/api/src/modules/explore/custom-mix.controller.js";
import { CustomMixService } from "../../../apps/api/src/modules/explore/custom-mix.service.js";
import { TasteController } from "../../../apps/api/src/modules/taste/taste.controller.js";
import { TasteService } from "../../../apps/api/src/modules/taste/taste.service.js";
import { BucketsRepository } from "../../../apps/api/src/modules/taste/buckets.repository.js";
import { BucketSongScoresRepository } from "../../../apps/api/src/modules/taste/bucket-song-scores.repository.js";
import { ContextScoresRepository } from "../../../apps/api/src/modules/taste/context-scores.repository.js";
import { CustomMixJobsRepository } from "../../../apps/api/src/modules/taste/custom-mix-jobs.repository.js";
import { SwipesRepository } from "../../../apps/api/src/modules/explore/explore.repository.js";
import { InterestScoresRepository } from "../../../apps/api/src/modules/search/interest-scores.repository.js";
import { AnthropicClient } from "../../../apps/api/src/modules/explore/anthropic.client.js";
import { FakeUsersRepository } from "./test-app.js";

const CUSTOM_MIX_TEST_ENV = {
  GOOGLE_CLIENT_ID: "test-google-client-id",
  GOOGLE_CLIENT_SECRET: "test-google-client-secret",
  GOOGLE_REDIRECT_URI: "http://localhost:5173/api/auth/google/callback",
  WEB_ORIGIN: "http://localhost:5173",
  SESSION_SECRET: "test-session-secret-32-bytes-custom-mix-feature",
  ANTHROPIC_MODEL: "claude-sonnet-4-6",
  NODE_ENV: "test",
};

/**
 * In-memory fakes for the CustomMixService dependency graph. The
 * shape mirrors the existing fakes in taste-test-app.ts and the
 * auto-bucket-builder data tests — direct property access on the
 * test side primes data and verifies side effects.
 */
export interface FakeSwipeDoc {
  userId: string;
  snapshotHash: string;
  snapshot: SongSnapshot;
  direction: "right" | "left";
  at: Date;
}

export class FakeSwipesRepository {
  docs: FakeSwipeDoc[] = [];
  async findSwipesForUser(userId: string): Promise<FakeSwipeDoc[]> {
    return this.docs.filter((d) => d.userId === userId);
  }
}

export interface FakeInterestScoreDoc {
  userId: string;
  songKey: string;
  snapshot: SongSnapshot;
  lastEventType: "explored" | "saved" | "completed";
  lastEventAt: Date;
}

export class FakeInterestScoresRepository {
  docs: FakeInterestScoreDoc[] = [];
  async findScoresForUser(userId: string): Promise<FakeInterestScoreDoc[]> {
    return this.docs.filter((d) => d.userId === userId);
  }
  async sampleByScoreBucket(): Promise<FakeInterestScoreDoc[]> {
    return [];
  }
}

export interface FakeBucketRow {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  kind: "auto" | "custom";
  state: "ready" | "building" | "failed";
  promptText: string | null;
  errorReason: string | null;
}

export class FakeBucketsRepository {
  rows: FakeBucketRow[] = [];
  async findForUser(userId: string): Promise<TasteBucket[]> {
    return this.rows
      .filter((r) => r.userId === userId)
      .map((r) => ({
        id: r.id,
        userId: r.userId,
        name: r.name,
        description: r.description,
        kind: r.kind,
        state: r.state,
        promptText: r.promptText,
        errorReason: r.errorReason,
        createdAt: "2026-05-17T00:00:00.000Z",
        lastBuiltAt: "2026-05-17T00:00:00.000Z",
        coverArtworkUrl: null,
      }));
  }
  async insertBucket(input: Omit<FakeBucketRow, "promptText" | "errorReason">): Promise<void> {
    this.rows.push({ ...input, promptText: null, errorReason: null });
  }
  async insertCustomBucket(input: {
    id: string;
    userId: string;
    promptText: string;
    createdAt: Date;
  }): Promise<void> {
    const initialName = input.promptText.trim().slice(0, 60) || "Custom mix";
    this.rows.push({
      id: input.id,
      userId: input.userId,
      name: initialName,
      description: "",
      kind: "custom",
      state: "building",
      promptText: input.promptText,
      errorReason: null,
    });
  }
  async markCustomReady(input: {
    userId: string;
    bucketId: string;
    name: string;
    description: string;
  }): Promise<void> {
    const row = this.rows.find((r) => r.userId === input.userId && r.id === input.bucketId);
    if (!row) return;
    row.name = input.name;
    row.description = input.description;
    row.state = "ready";
  }
  async markCustomFailed(input: {
    userId: string;
    bucketId: string;
    errorReason: string;
  }): Promise<void> {
    const row = this.rows.find((r) => r.userId === input.userId && r.id === input.bucketId);
    if (!row) return;
    row.state = "failed";
    row.errorReason = input.errorReason;
  }
}

export interface FakeBucketSongScoreRow {
  userId: string;
  bucketId: string;
  songKey: string;
  score: number;
  snapshot: SongSnapshot;
}

export class FakeBucketSongScoresRepository {
  rows: FakeBucketSongScoreRow[] = [];
  async insertInitialScore(input: {
    userId: string;
    bucketId: string;
    songKey: string;
    snapshot: SongSnapshot;
    initialScore: number;
  }): Promise<void> {
    const existing = this.rows.find(
      (r) =>
        r.userId === input.userId && r.bucketId === input.bucketId && r.songKey === input.songKey,
    );
    if (existing) return;
    this.rows.push({
      userId: input.userId,
      bucketId: input.bucketId,
      songKey: input.songKey,
      score: input.initialScore,
      snapshot: input.snapshot,
    });
  }
  async findScoresForUser(userId: string): Promise<FakeBucketSongScoreRow[]> {
    return this.rows.filter((r) => r.userId === userId);
  }
  async findForUserBucket(userId: string, bucketId: string): Promise<FakeBucketSongScoreRow[]> {
    return this.rows.filter((r) => r.userId === userId && r.bucketId === bucketId);
  }
  async findBucketIdsForSong(): Promise<string[]> {
    return [];
  }
  async inc(): Promise<void> {}
}

export class FakeContextScoresRepository {
  rows: { userId: string; songKey: string; axis: string; value: string; score: number }[] = [];
  async findForUser(userId: string) {
    return this.rows.filter((r) => r.userId === userId);
  }
  async inc(): Promise<void> {}
  async set(): Promise<void> {}
}

export interface FakeCustomMixJob {
  jobId: string;
  userId: string;
  bucketId: string;
  promptText: string;
  state: "building" | "completed" | "failed";
  errorReason: string | null;
  sourceBuckets: Record<string, string[]> | null;
  startedAt: Date;
  completedAt: Date | null;
}

export class FakeCustomMixJobsRepository {
  rows: FakeCustomMixJob[] = [];
  async insert(input: {
    jobId: string;
    userId: string;
    bucketId: string;
    promptText: string;
    startedAt: Date;
  }): Promise<void> {
    this.rows.push({
      jobId: input.jobId,
      userId: input.userId,
      bucketId: input.bucketId,
      promptText: input.promptText,
      state: "building",
      errorReason: null,
      sourceBuckets: null,
      startedAt: input.startedAt,
      completedAt: null,
    });
  }
  async markCompleted(input: {
    jobId: string;
    sourceBuckets: Record<string, string[]>;
    completedAt: Date;
  }): Promise<void> {
    const row = this.rows.find((r) => r.jobId === input.jobId);
    if (!row) return;
    row.state = "completed";
    row.sourceBuckets = input.sourceBuckets;
    row.completedAt = input.completedAt;
  }
  async markFailed(input: {
    jobId: string;
    errorReason: string;
    completedAt: Date;
  }): Promise<void> {
    const row = this.rows.find((r) => r.jobId === input.jobId);
    if (!row) return;
    row.state = "failed";
    row.errorReason = input.errorReason;
    row.completedAt = input.completedAt;
  }
  async countInFlight(userId: string): Promise<number> {
    return this.rows.filter((r) => r.userId === userId && r.state === "building").length;
  }
}

export class FakeAnthropicClient {
  // Default response: a small but valid mix.
  response: { text: string } = {
    text: JSON.stringify({
      name: "Custom Mix",
      description: "Test mix",
      songs: [],
    }),
  };
  // Optional override — when set, complete() rejects with this error instead.
  rejectWith: Error | null = null;
  calls: { system: string; userMessage: string; model: string; maxTokens: number }[] = [];

  async complete(req: {
    system: string;
    userMessage: string;
    model: string;
    maxTokens: number;
  }): Promise<{ text: string }> {
    this.calls.push(req);
    if (this.rejectWith) throw this.rejectWith;
    return this.response;
  }
}

const fakeSwipesToken = Symbol.for("test:fake-swipes-repo-custom-mix");
const fakeInterestScoresToken = Symbol.for("test:fake-interest-scores-repo-custom-mix");
const fakeBucketsToken = Symbol.for("test:fake-buckets-repo-custom-mix");
const fakeBucketScoresToken = Symbol.for("test:fake-bucket-scores-repo-custom-mix");
const fakeContextScoresToken = Symbol.for("test:fake-context-scores-repo-custom-mix");
const fakeJobsToken = Symbol.for("test:fake-jobs-repo-custom-mix");
const fakeAnthropicToken = Symbol.for("test:fake-anthropic-custom-mix");
const fakeUsersToken = Symbol.for("test:fake-users-repo-custom-mix");

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: true,
      load: [() => ({ ...CUSTOM_MIX_TEST_ENV })],
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
  controllers: [CustomMixController, TasteController],
  providers: [
    CustomMixService,
    TasteService,
    AuthService,
    UsersService,
    { provide: fakeUsersToken, useFactory: () => new FakeUsersRepository() },
    {
      provide: UsersRepository,
      useFactory: (fake: FakeUsersRepository) => fake as unknown as UsersRepository,
      inject: [fakeUsersToken],
    },
    { provide: fakeSwipesToken, useFactory: () => new FakeSwipesRepository() },
    {
      provide: SwipesRepository,
      useFactory: (fake: FakeSwipesRepository) => fake as unknown as SwipesRepository,
      inject: [fakeSwipesToken],
    },
    { provide: fakeInterestScoresToken, useFactory: () => new FakeInterestScoresRepository() },
    {
      provide: InterestScoresRepository,
      useFactory: (fake: FakeInterestScoresRepository) =>
        fake as unknown as InterestScoresRepository,
      inject: [fakeInterestScoresToken],
    },
    { provide: fakeBucketsToken, useFactory: () => new FakeBucketsRepository() },
    {
      provide: BucketsRepository,
      useFactory: (fake: FakeBucketsRepository) => fake as unknown as BucketsRepository,
      inject: [fakeBucketsToken],
    },
    { provide: fakeBucketScoresToken, useFactory: () => new FakeBucketSongScoresRepository() },
    {
      provide: BucketSongScoresRepository,
      useFactory: (fake: FakeBucketSongScoresRepository) =>
        fake as unknown as BucketSongScoresRepository,
      inject: [fakeBucketScoresToken],
    },
    { provide: fakeContextScoresToken, useFactory: () => new FakeContextScoresRepository() },
    {
      provide: ContextScoresRepository,
      useFactory: (fake: FakeContextScoresRepository) => fake as unknown as ContextScoresRepository,
      inject: [fakeContextScoresToken],
    },
    { provide: fakeJobsToken, useFactory: () => new FakeCustomMixJobsRepository() },
    {
      provide: CustomMixJobsRepository,
      useFactory: (fake: FakeCustomMixJobsRepository) => fake as unknown as CustomMixJobsRepository,
      inject: [fakeJobsToken],
    },
    { provide: fakeAnthropicToken, useFactory: () => new FakeAnthropicClient() },
    {
      provide: AnthropicClient,
      useFactory: (fake: FakeAnthropicClient) => fake as unknown as AnthropicClient,
      inject: [fakeAnthropicToken],
    },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
class CustomMixTestModule {}

export interface CustomMixTestAppHandle {
  app: INestApplication;
  swipes: FakeSwipesRepository;
  interestScores: FakeInterestScoresRepository;
  buckets: FakeBucketsRepository;
  bucketScores: FakeBucketSongScoresRepository;
  contextScores: FakeContextScoresRepository;
  jobs: FakeCustomMixJobsRepository;
  anthropic: FakeAnthropicClient;
  authService: AuthService;
  env: typeof CUSTOM_MIX_TEST_ENV;
}

export async function buildCustomMixTestApp(): Promise<CustomMixTestAppHandle> {
  const app = await NestFactory.create(CustomMixTestModule, { logger: false });
  app.use(cookieParser());
  app.setGlobalPrefix("api", {
    exclude: [{ path: "health", method: RequestMethod.GET }],
  });
  await app.init();

  return {
    app,
    swipes: app.get<FakeSwipesRepository>(fakeSwipesToken),
    interestScores: app.get<FakeInterestScoresRepository>(fakeInterestScoresToken),
    buckets: app.get<FakeBucketsRepository>(fakeBucketsToken),
    bucketScores: app.get<FakeBucketSongScoresRepository>(fakeBucketScoresToken),
    contextScores: app.get<FakeContextScoresRepository>(fakeContextScoresToken),
    jobs: app.get<FakeCustomMixJobsRepository>(fakeJobsToken),
    anthropic: app.get<FakeAnthropicClient>(fakeAnthropicToken),
    authService: app.get(AuthService),
    env: CUSTOM_MIX_TEST_ENV,
  };
}

/**
 * Seed a user with N right-swiped songs so the touched-songs pool is
 * non-empty. Returns the songKeys created (caller uses them to stage
 * the FakeAnthropicClient's response).
 */
export function seedRightSwipes(
  swipes: FakeSwipesRepository,
  userId: string,
  count: number,
): { songKey: string; snapshot: SongSnapshot }[] {
  const out: { songKey: string; snapshot: SongSnapshot }[] = [];
  for (let i = 0; i < count; i++) {
    const snapshot: SongSnapshot = {
      title: `Song ${i}`,
      artist: `Artist ${i}`,
      kind: "track",
      coverUrl: `https://cdn.example/cover-${i}.jpg`,
    };
    const snapshotHash = `hash-${userId}-${i}`;
    const songKey = `snap:${snapshotHash}`;
    swipes.docs.push({
      userId,
      snapshotHash,
      snapshot,
      direction: "right",
      at: new Date(),
    });
    out.push({ songKey, snapshot });
  }
  return out;
}
