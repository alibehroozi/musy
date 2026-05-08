import "reflect-metadata";
import { Module, RequestMethod, type INestApplication } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { APP_FILTER, APP_GUARD, NestFactory } from "@nestjs/core";
import cookieParser from "cookie-parser";
import type { ExploredEventRequest, SavedEventRequest } from "@moc/contracts";
import type { InterestEventType } from "@moc/api-core";

import { AllExceptionsFilter } from "../../../apps/api/src/common/all-exceptions.filter.js";
import { AuthGuard } from "../../../apps/api/src/common/auth.guard.js";
import { HealthController } from "../../../apps/api/src/health.controller.js";
import { AuthService } from "../../../apps/api/src/modules/auth/auth.service.js";
import { UsersRepository } from "../../../apps/api/src/modules/users/users.repository.js";
import { UsersService } from "../../../apps/api/src/modules/users/users.service.js";
import { SearchEventsController } from "../../../apps/api/src/modules/search/search-events.controller.js";
import { InterestScoresRepository } from "../../../apps/api/src/modules/search/interest-scores.repository.js";
import { FakeUsersRepository } from "./test-app.js";

export const INTEREST_SCORES_TEST_ENV = {
  GOOGLE_CLIENT_ID: "test-google-client-id",
  GOOGLE_CLIENT_SECRET: "test-google-client-secret",
  GOOGLE_REDIRECT_URI: "http://localhost:5173/api/auth/google/callback",
  WEB_ORIGIN: "http://localhost:5173",
  SESSION_SECRET: "test-session-secret-32-bytes-interest-scores-tests",
  NODE_ENV: "test",
};

type EventBody = ExploredEventRequest | SavedEventRequest;

export class FakeInterestScoresRepository {
  records: Array<{
    userId: string;
    eventType: InterestEventType;
    body: EventBody;
  }> = [];

  async recordEvent(userId: string, eventType: InterestEventType, body: EventBody): Promise<void> {
    this.records.push({ userId, eventType, body });
  }
}

const fakeInterestRepoToken = Symbol.for("test:fake-interest-scores-repo");
const fakeUsersToken = Symbol.for("test:fake-users-repo-interest");

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: true,
      load: [() => ({ ...INTEREST_SCORES_TEST_ENV })],
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
class TestInterestScoresModule {}

export interface InterestScoresTestAppHandle {
  app: INestApplication;
  interestRepo: FakeInterestScoresRepository;
  authService: AuthService;
  env: typeof INTEREST_SCORES_TEST_ENV;
}

export async function buildInterestScoresTestApp(): Promise<InterestScoresTestAppHandle> {
  const app = await NestFactory.create(TestInterestScoresModule, { logger: false });
  app.use(cookieParser());
  app.setGlobalPrefix("api", {
    exclude: [{ path: "health", method: RequestMethod.GET }],
  });
  await app.init();

  const interestRepo = app.get<FakeInterestScoresRepository>(fakeInterestRepoToken);
  const authService = app.get(AuthService);

  return { app, interestRepo, authService, env: INTEREST_SCORES_TEST_ENV };
}
