import "reflect-metadata";
import { Module, RequestMethod, type INestApplication } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { APP_FILTER, APP_GUARD, NestFactory } from "@nestjs/core";
import cookieParser from "cookie-parser";
import type { GoogleProfile, User } from "@moc/contracts";

import { AllExceptionsFilter } from "../../../apps/api/src/common/all-exceptions.filter.js";
import { AuthGuard } from "../../../apps/api/src/common/auth.guard.js";
import { HealthController } from "../../../apps/api/src/health.controller.js";
import { AuthController } from "../../../apps/api/src/modules/auth/auth.controller.js";
import { AuthService } from "../../../apps/api/src/modules/auth/auth.service.js";
import { UsersRepository } from "../../../apps/api/src/modules/users/users.repository.js";
import { UsersService } from "../../../apps/api/src/modules/users/users.service.js";

const TEST_ENV = {
  GOOGLE_CLIENT_ID: "test-google-client-id",
  GOOGLE_CLIENT_SECRET: "test-google-client-secret-DO-NOT-LEAK",
  GOOGLE_REDIRECT_URI: "http://localhost:5173/api/auth/google/callback",
  WEB_ORIGIN: "http://localhost:5173",
  SESSION_SECRET: "test-session-secret-32-bytes-of-randomness-or-so",
  NODE_ENV: "test",
};

export class FakeUsersRepository {
  byId = new Map<string, User>();
  byGoogleId = new Map<string, User>();

  async findById(id: string): Promise<User | null> {
    return this.byId.get(id) ?? null;
  }
  async findByGoogleId(googleId: string): Promise<User | null> {
    return this.byGoogleId.get(googleId) ?? null;
  }
  async create(u: User): Promise<User> {
    this.byId.set(u.id, u);
    this.byGoogleId.set(u.googleId, u);
    return u;
  }
}

const fakeUsersToken = Symbol.for("test:fake-users-repo");

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: true,
      load: [() => ({ ...TEST_ENV })],
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
  controllers: [AuthController, HealthController],
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
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
class TestAppModule {}

export interface TestAppHandle {
  app: INestApplication;
  fakeUsers: FakeUsersRepository;
  authService: AuthService;
  env: typeof TEST_ENV;
}

export async function buildTestApp(): Promise<TestAppHandle> {
  const app = await NestFactory.create(TestAppModule, { logger: false });
  app.use(cookieParser());
  app.setGlobalPrefix("api", {
    exclude: [{ path: "health", method: RequestMethod.GET }],
  });
  await app.init();

  const fakeUsers = app.get<FakeUsersRepository>(fakeUsersToken);
  const authService = app.get(AuthService);
  return { app, fakeUsers, authService, env: TEST_ENV };
}

export function makeTestUser(overrides: Partial<User> = {}): User {
  return {
    id: overrides.id ?? "550e8400-e29b-41d4-a716-446655440000",
    email: overrides.email ?? "alice@example.com",
    googleId: overrides.googleId ?? "g_alice_117851234567890123456",
    createdAt: overrides.createdAt ?? "2026-05-07T00:00:00.000Z",
  };
}

export function makeGoogleProfile(overrides: Partial<GoogleProfile> = {}): GoogleProfile {
  return {
    sub: overrides.sub ?? "g_alice_117851234567890123456",
    email: overrides.email ?? "alice@example.com",
    email_verified: overrides.email_verified ?? true,
    ...(overrides.name !== undefined ? { name: overrides.name } : {}),
    ...(overrides.picture !== undefined ? { picture: overrides.picture } : {}),
  };
}
