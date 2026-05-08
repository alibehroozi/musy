import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { MongooseModule } from "@nestjs/mongoose";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { UsersModule } from "./modules/users/users.module.js";
import { AuthModule } from "./modules/auth/auth.module.js";
import { SearchModule } from "./modules/search/search.module.js";
import { HealthController } from "./health.controller.js";
import { AllExceptionsFilter } from "./common/all-exceptions.filter.js";
import { AuthGuard } from "./common/auth.guard.js";

@Module({
  imports: [
    // Local dev loads apps/api/.env.local (preferred) and falls back to .env
    // when only the legacy file exists. Cwd is apps/api/ when npm run dev:api
    // runs, so the relative paths resolve correctly. In prod, no .env file is
    // loaded — vars come from the host's process env.
    ConfigModule.forRoot({ isGlobal: true, envFilePath: [".env.local", ".env"] }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.getOrThrow<string>("MONGO_URI"),
      }),
    }),
    UsersModule,
    AuthModule,
    SearchModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}
