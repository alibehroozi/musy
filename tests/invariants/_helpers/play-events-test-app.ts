import "reflect-metadata";
import { Module, RequestMethod, type INestApplication } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { APP_FILTER, APP_GUARD, NestFactory } from "@nestjs/core";
import cookieParser from "cookie-parser";
import type { PlayEventType, ProviderName, SongSnapshot } from "@moc/contracts";
import { songKeyOf } from "@moc/api-core";

import { AllExceptionsFilter } from "../../../apps/api/src/common/all-exceptions.filter.js";
import { AuthGuard } from "../../../apps/api/src/common/auth.guard.js";
import { HealthController } from "../../../apps/api/src/health.controller.js";
import { AuthService } from "../../../apps/api/src/modules/auth/auth.service.js";
import { UsersRepository } from "../../../apps/api/src/modules/users/users.repository.js";
import { UsersService } from "../../../apps/api/src/modules/users/users.service.js";
import { PlayEventsController } from "../../../apps/api/src/modules/play/play-events.controller.js";
import { PlayEventsService } from "../../../apps/api/src/modules/play/play-events.service.js";
import { ListeningEventsRepository } from "../../../apps/api/src/modules/play/listening-events.repository.js";
import { InterestScoresRepository } from "../../../apps/api/src/modules/search/interest-scores.repository.js";
import { FakeUsersRepository } from "./test-app.js";
import { FakeInterestScoresRepository } from "./search-events-test-app.js";

export const PLAY_EVENTS_TEST_ENV = {
  GOOGLE_CLIENT_ID: "test-google-client-id",
  GOOGLE_CLIENT_SECRET: "test-google-client-secret",
  GOOGLE_REDIRECT_URI: "http://localhost:5173/api/auth/google/callback",
  WEB_ORIGIN: "http://localhost:5173",
  SESSION_SECRET: "test-session-secret-32-bytes-for-play-events-aaa",
  NODE_ENV: "test",
};

export interface FakeListeningEventDoc {
  userId: string;
  source: ProviderName;
  externalId: string;
  songKey: string;
  eventType: PlayEventType;
  elapsedMs: number;
  at: Date;
}

/**
 * In-memory stand-in for ListeningEventsRepository — append-only log,
 * mirrors the production .record / .findEventsForUser surface.
 */
export class FakeListeningEventsRepository {
  events: FakeListeningEventDoc[] = [];

  async record(input: {
    userId: string;
    source: ProviderName;
    externalId: string;
    eventType: PlayEventType;
    elapsedMs: number;
  }): Promise<void> {
    this.events.push({
      userId: input.userId,
      source: input.source,
      externalId: input.externalId,
      songKey: songKeyOf(input.source, input.externalId),
      eventType: input.eventType,
      elapsedMs: input.elapsedMs,
      at: new Date(),
    });
  }

  async findEventsForUser(userId: string): Promise<FakeListeningEventDoc[]> {
    return this.events.filter((e) => e.userId === userId);
  }
}

const fakeUsersToken = Symbol.for("test:fake-users-repo-play-events");
const fakeListeningRepoToken = Symbol.for("test:fake-listening-events-repo");
const fakeInterestRepoToken = Symbol.for("test:fake-interest-repo-play-events");

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: true,
      load: [() => ({ ...PLAY_EVENTS_TEST_ENV })],
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
  controllers: [PlayEventsController, HealthController],
  providers: [
    PlayEventsService,
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
      provide: fakeListeningRepoToken,
      useFactory: () => new FakeListeningEventsRepository(),
    },
    {
      provide: ListeningEventsRepository,
      useFactory: (fake: FakeListeningEventsRepository) =>
        fake as unknown as ListeningEventsRepository,
      inject: [fakeListeningRepoToken],
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
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
class TestPlayEventsModule {}

export interface PlayEventsTestAppHandle {
  app: INestApplication;
  listeningRepo: FakeListeningEventsRepository;
  interestRepo: FakeInterestScoresRepository;
  authService: AuthService;
  env: typeof PLAY_EVENTS_TEST_ENV;
}

export async function buildPlayEventsTestApp(): Promise<PlayEventsTestAppHandle> {
  const app = await NestFactory.create(TestPlayEventsModule, { logger: false });
  app.use(cookieParser());
  app.setGlobalPrefix("api", {
    exclude: [{ path: "health", method: RequestMethod.GET }],
  });
  await app.init();

  const listeningRepo = app.get<FakeListeningEventsRepository>(fakeListeningRepoToken);
  const interestRepo = app.get<FakeInterestScoresRepository>(fakeInterestRepoToken);
  const authService = app.get(AuthService);
  return { app, listeningRepo, interestRepo, authService, env: PLAY_EVENTS_TEST_ENV };
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
