import "reflect-metadata";
import { Module, RequestMethod, type INestApplication } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { APP_FILTER, APP_GUARD, NestFactory } from "@nestjs/core";
import cookieParser from "cookie-parser";
import type { InterestEventType, ProviderName, SongSnapshot } from "@moc/contracts";
import { applyInterestEvent, computeSnapshotHash, songKeyOf } from "@moc/api-core";

import { AllExceptionsFilter } from "../../../apps/api/src/common/all-exceptions.filter.js";
import { AuthGuard } from "../../../apps/api/src/common/auth.guard.js";
import { HealthController } from "../../../apps/api/src/health.controller.js";
import { AuthService } from "../../../apps/api/src/modules/auth/auth.service.js";
import { UsersRepository } from "../../../apps/api/src/modules/users/users.repository.js";
import { UsersService } from "../../../apps/api/src/modules/users/users.service.js";
import { SearchEventsController } from "../../../apps/api/src/modules/search/search-events.controller.js";
import { InterestScoresRepository } from "../../../apps/api/src/modules/search/interest-scores.repository.js";
import { ScoringService } from "../../../apps/api/src/modules/taste/scoring.service.js";
import { FakeUsersRepository } from "./test-app.js";
import { FakeScoringService } from "./fake-scoring-service.js";

export const EVENTS_TEST_ENV = {
  GOOGLE_CLIENT_ID: "test-google-client-id",
  GOOGLE_CLIENT_SECRET: "test-google-client-secret",
  GOOGLE_REDIRECT_URI: "http://localhost:5173/api/auth/google/callback",
  WEB_ORIGIN: "http://localhost:5173",
  SESSION_SECRET: "test-session-secret-32-bytes-for-events-tests-x",
  NODE_ENV: "test",
};

export interface FakeInterestDoc {
  userId: string;
  source?: ProviderName;
  externalId?: string;
  songKey: string;
  snapshot: SongSnapshot;
  score: number;
  firstEventType: InterestEventType;
  lastEventType: InterestEventType;
  firstEventAt: Date;
  lastEventAt: Date;
}

/**
 * In-memory stand-in for InterestScoresRepository — same surface, no
 * Mongo. Mirrors the production upsert (max-rule via api-core, snapshot
 * written once on insert) so test invariants exercise the same logic.
 */
export class FakeInterestScoresRepository {
  docs = new Map<string, FakeInterestDoc>();

  private keyOf(userId: string, songKey: string): string {
    return `${userId}::${songKey}`;
  }

  async upsertEvent(input: {
    userId: string;
    source: ProviderName;
    externalId: string;
    snapshot: SongSnapshot;
    eventType: InterestEventType;
  }): Promise<void> {
    await this.applyUpsert({
      userId: input.userId,
      songKey: songKeyOf(input.source, input.externalId),
      source: input.source,
      externalId: input.externalId,
      snapshot: input.snapshot,
      eventType: input.eventType,
    });
  }

  async upsertEventBySnapshot(input: {
    userId: string;
    snapshot: SongSnapshot;
    eventType: InterestEventType;
  }): Promise<void> {
    const snapshotHash = computeSnapshotHash(input.snapshot);
    await this.applyUpsert({
      userId: input.userId,
      songKey: `snap:${snapshotHash}`,
      snapshot: input.snapshot,
      eventType: input.eventType,
    });
  }

  async findScoresForUser(userId: string): Promise<FakeInterestDoc[]> {
    return Array.from(this.docs.values()).filter((d) => d.userId === userId);
  }

  /**
   * Mirror of the real InterestScoresRepository.sampleByScoreBucket.
   * Deterministic in tests (no random shuffle) so tests can assert on
   * exact contents — production uses Mongo $sample for true randomness.
   * Returns the first `count` docs in insertion order (newest-first by
   * Map iteration semantics).
   */
  async sampleByScoreBucket(
    userId: string,
    minScore: number,
    maxScore: number,
    count: number,
  ): Promise<FakeInterestDoc[]> {
    if (count <= 0) return [];
    return Array.from(this.docs.values())
      .filter((d) => d.userId === userId && d.score >= minScore && d.score <= maxScore)
      .slice(0, count);
  }

  private async applyUpsert(input: {
    userId: string;
    songKey: string;
    source?: ProviderName;
    externalId?: string;
    snapshot: SongSnapshot;
    eventType: InterestEventType;
  }): Promise<void> {
    const k = this.keyOf(input.userId, input.songKey);
    const existing = this.docs.get(k);
    const { score: nextScore } = applyInterestEvent(existing?.score ?? null, input.eventType);
    const now = new Date();
    if (existing) {
      this.docs.set(k, {
        ...existing,
        score: nextScore,
        lastEventType: input.eventType,
        lastEventAt: now,
      });
    } else {
      this.docs.set(k, {
        userId: input.userId,
        ...(input.source !== undefined ? { source: input.source } : {}),
        ...(input.externalId !== undefined ? { externalId: input.externalId } : {}),
        songKey: input.songKey,
        snapshot: input.snapshot,
        score: nextScore,
        firstEventType: input.eventType,
        lastEventType: input.eventType,
        firstEventAt: now,
        lastEventAt: now,
      });
    }
  }
}

const fakeRepoToken = Symbol.for("test:fake-interest-repo");
const fakeUsersToken = Symbol.for("test:fake-users-repo-events");
const fakeScoringToken = Symbol.for("test:fake-scoring-search-events");

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: true,
      load: [() => ({ ...EVENTS_TEST_ENV })],
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
  controllers: [SearchEventsController, HealthController],
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
      provide: fakeRepoToken,
      useFactory: () => new FakeInterestScoresRepository(),
    },
    {
      provide: InterestScoresRepository,
      useFactory: (fake: FakeInterestScoresRepository) =>
        fake as unknown as InterestScoresRepository,
      inject: [fakeRepoToken],
    },
    {
      provide: fakeScoringToken,
      useFactory: () => new FakeScoringService(),
    },
    {
      provide: ScoringService,
      useFactory: (fake: FakeScoringService) => fake as unknown as ScoringService,
      inject: [fakeScoringToken],
    },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
class TestSearchEventsModule {}

export interface SearchEventsTestAppHandle {
  app: INestApplication;
  repo: FakeInterestScoresRepository;
  scoring: FakeScoringService;
  authService: AuthService;
  env: typeof EVENTS_TEST_ENV;
}

export async function buildSearchEventsTestApp(): Promise<SearchEventsTestAppHandle> {
  const app = await NestFactory.create(TestSearchEventsModule, { logger: false });
  app.use(cookieParser());
  app.setGlobalPrefix("api", {
    exclude: [{ path: "health", method: RequestMethod.GET }],
  });
  await app.init();

  const repo = app.get<FakeInterestScoresRepository>(fakeRepoToken);
  const scoring = app.get<FakeScoringService>(fakeScoringToken);
  const authService = app.get(AuthService);
  return { app, repo, scoring, authService, env: EVENTS_TEST_ENV };
}
