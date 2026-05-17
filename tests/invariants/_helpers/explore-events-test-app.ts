import "reflect-metadata";
import { Module, RequestMethod, type INestApplication } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { APP_FILTER, APP_GUARD, NestFactory } from "@nestjs/core";
import cookieParser from "cookie-parser";
import type { SongSnapshot, SwipeDirection, TasteProfile } from "@moc/contracts";

import { AllExceptionsFilter } from "../../../apps/api/src/common/all-exceptions.filter.js";
import { AuthGuard } from "../../../apps/api/src/common/auth.guard.js";
import { HealthController } from "../../../apps/api/src/health.controller.js";
import { AuthService } from "../../../apps/api/src/modules/auth/auth.service.js";
import { UsersRepository } from "../../../apps/api/src/modules/users/users.repository.js";
import { UsersService } from "../../../apps/api/src/modules/users/users.service.js";
import { ExploreController } from "../../../apps/api/src/modules/explore/explore.controller.js";
import { ExploreService } from "../../../apps/api/src/modules/explore/explore.service.js";
import { SwipesRepository } from "../../../apps/api/src/modules/explore/explore.repository.js";
import { ProfileBuilderService } from "../../../apps/api/src/modules/explore/profile-builder.service.js";
import { QueueBuilderService } from "../../../apps/api/src/modules/explore/queue-builder.service.js";
import { InterestScoresRepository } from "../../../apps/api/src/modules/search/interest-scores.repository.js";
import { ScoringService } from "../../../apps/api/src/modules/taste/scoring.service.js";
import { FakeUsersRepository } from "./test-app.js";
import { FakeInterestScoresRepository } from "./search-events-test-app.js";
import { FakeScoringService } from "./fake-scoring-service.js";

export const EXPLORE_EVENTS_TEST_ENV = {
  GOOGLE_CLIENT_ID: "test-google-client-id",
  GOOGLE_CLIENT_SECRET: "test-google-client-secret",
  GOOGLE_REDIRECT_URI: "http://localhost:5173/api/auth/google/callback",
  WEB_ORIGIN: "http://localhost:5173",
  SESSION_SECRET: "test-session-secret-32-bytes-explore-swipes-aaa",
  NODE_ENV: "test",
};

export interface FakeSwipeDoc {
  userId: string;
  snapshot: SongSnapshot;
  snapshotHash: string;
  direction: SwipeDirection;
  at: Date;
}

/**
 * In-memory stand-in for SwipesRepository — append-only log mirroring
 * the production .record / .findSwipesForUser surface.
 */
export class FakeSwipesRepository {
  swipes: FakeSwipeDoc[] = [];

  async record(input: {
    userId: string;
    snapshot: SongSnapshot;
    snapshotHash: string;
    direction: SwipeDirection;
  }): Promise<void> {
    this.swipes.push({
      userId: input.userId,
      snapshot: input.snapshot,
      snapshotHash: input.snapshotHash,
      direction: input.direction,
      at: new Date(),
    });
  }

  async findSwipesForUser(userId: string): Promise<FakeSwipeDoc[]> {
    return this.swipes.filter((s) => s.userId === userId);
  }
}

/**
 * In-memory stand-in for ProfileBuilderService. The swipe invariant
 * tests don't care whether builds run; the profile-read tests prime
 * `profilesByUser` directly to assert SEC-10 and the API-15 shape.
 */
export class FakeProfileBuilderService {
  profilesByUser = new Map<string, TasteProfile>();
  maybeBuildCalls: string[] = [];

  async maybeBuild(userId: string): Promise<void> {
    this.maybeBuildCalls.push(userId);
  }

  async getProfile(userId: string): Promise<TasteProfile | null> {
    return this.profilesByUser.get(userId) ?? null;
  }
}

/**
 * In-memory stand-in for QueueBuilderService. Tests that exercise the
 * queue endpoints prime `queuesByUser` directly; tests that only care
 * about swipe writes ignore it. `maybeRefillCalls` lets tests assert
 * the refill trigger fired without spinning a real queue builder.
 */
export interface FakeQueueDoc {
  items: SongSnapshot[];
  phase: "discovery" | "artist-refinement" | "personalized";
}

export class FakeQueueBuilderService {
  queuesByUser = new Map<string, FakeQueueDoc>();
  // API-20: tests prime this to simulate "a rebuild is in flight". The
  // fake mirrors the real QueueBuilderService.inFlightRebuilds key set.
  inFlightUserIds = new Set<string>();
  maybeRefillCalls: string[] = [];
  rebuildCalls: string[] = [];

  async getNext(
    userId: string,
    count: number,
  ): Promise<{
    items: SongSnapshot[];
    phase: FakeQueueDoc["phase"];
    partial: boolean;
    buildingQueue: boolean;
  }> {
    const safeCount = Math.max(1, Math.min(50, Math.floor(count)));
    const queue = this.queuesByUser.get(userId);
    const buildingQueue = this.inFlightUserIds.has(userId);
    if (!queue) {
      return { items: [], phase: "discovery", partial: true, buildingQueue };
    }
    // Mirrors API-17 in the real QueueBuilderService.getNext: items
    // without a non-empty coverUrl never reach the wire.
    const items = queue.items
      .filter((s) => typeof s.coverUrl === "string" && s.coverUrl.length > 0)
      .slice(0, safeCount);
    return { items, phase: queue.phase, partial: items.length < safeCount, buildingQueue };
  }

  async maybeRefill(userId: string): Promise<void> {
    this.maybeRefillCalls.push(userId);
  }

  async rebuildQueue(userId: string): Promise<void> {
    this.rebuildCalls.push(userId);
  }
}

const fakeUsersToken = Symbol.for("test:fake-users-repo-explore");
const fakeSwipesRepoToken = Symbol.for("test:fake-swipes-repo");
const fakeInterestRepoToken = Symbol.for("test:fake-interest-repo-explore");
const fakeProfileBuilderToken = Symbol.for("test:fake-profile-builder");
const fakeQueueBuilderToken = Symbol.for("test:fake-queue-builder");
const fakeScoringToken = Symbol.for("test:fake-scoring-explore");

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: true,
      load: [() => ({ ...EXPLORE_EVENTS_TEST_ENV })],
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
  controllers: [ExploreController, HealthController],
  providers: [
    ExploreService,
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
      provide: fakeSwipesRepoToken,
      useFactory: () => new FakeSwipesRepository(),
    },
    {
      provide: SwipesRepository,
      useFactory: (fake: FakeSwipesRepository) => fake as unknown as SwipesRepository,
      inject: [fakeSwipesRepoToken],
    },
    {
      provide: fakeInterestRepoToken,
      useFactory: () => new FakeInterestScoresRepository(),
    },
    {
      provide: InterestScoresRepository,
      useFactory: (fake: FakeInterestScoresRepository) =>
        fake as unknown as InterestScoresRepository,
      inject: [fakeInterestRepoToken],
    },
    {
      provide: fakeProfileBuilderToken,
      useFactory: () => new FakeProfileBuilderService(),
    },
    {
      provide: ProfileBuilderService,
      useFactory: (fake: FakeProfileBuilderService) => fake as unknown as ProfileBuilderService,
      inject: [fakeProfileBuilderToken],
    },
    {
      provide: fakeQueueBuilderToken,
      useFactory: () => new FakeQueueBuilderService(),
    },
    {
      provide: QueueBuilderService,
      useFactory: (fake: FakeQueueBuilderService) => fake as unknown as QueueBuilderService,
      inject: [fakeQueueBuilderToken],
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
class TestExploreEventsModule {}

export interface ExploreEventsTestAppHandle {
  app: INestApplication;
  swipesRepo: FakeSwipesRepository;
  interestRepo: FakeInterestScoresRepository;
  profileBuilder: FakeProfileBuilderService;
  queueBuilder: FakeQueueBuilderService;
  scoring: FakeScoringService;
  authService: AuthService;
  env: typeof EXPLORE_EVENTS_TEST_ENV;
}

export async function buildExploreEventsTestApp(): Promise<ExploreEventsTestAppHandle> {
  const app = await NestFactory.create(TestExploreEventsModule, { logger: false });
  app.use(cookieParser());
  app.setGlobalPrefix("api", {
    exclude: [{ path: "health", method: RequestMethod.GET }],
  });
  await app.init();

  const swipesRepo = app.get<FakeSwipesRepository>(fakeSwipesRepoToken);
  const interestRepo = app.get<FakeInterestScoresRepository>(fakeInterestRepoToken);
  const profileBuilder = app.get<FakeProfileBuilderService>(fakeProfileBuilderToken);
  const queueBuilder = app.get<FakeQueueBuilderService>(fakeQueueBuilderToken);
  const scoring = app.get<FakeScoringService>(fakeScoringToken);
  const authService = app.get(AuthService);
  return {
    app,
    swipesRepo,
    interestRepo,
    profileBuilder,
    queueBuilder,
    scoring,
    authService,
    env: EXPLORE_EVENTS_TEST_ENV,
  };
}

export function makeSnapshot(overrides: Partial<SongSnapshot> = {}): SongSnapshot {
  // Default coverUrl populated (non-empty) so the queue-contract invariants
  // (DATA-13, API-17) hold by default. Tests that need a cover-less snapshot
  // pass `coverUrl: ""` explicitly, and the helper omits the field — which
  // is what those tests want (queue items missing a cover should be dropped).
  const out: SongSnapshot = {
    title: overrides.title ?? "Bohemian Rhapsody",
    artist: overrides.artist ?? "Queen",
    kind: overrides.kind ?? "track",
    coverUrl: overrides.coverUrl ?? "https://cdn/cover.jpg",
    ...(overrides.year !== undefined ? { year: overrides.year } : {}),
    ...(overrides.durationSec !== undefined ? { durationSec: overrides.durationSec } : {}),
  };
  if (overrides.coverUrl === "") {
    delete (out as Partial<SongSnapshot>).coverUrl;
  }
  return out;
}
