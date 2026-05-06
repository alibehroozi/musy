import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { MongooseModule } from "@nestjs/mongoose";
import { UsersModule } from "./modules/users/users.module.js";
import { HealthController } from "./health.controller.js";

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
  ],
  controllers: [HealthController],
})
export class AppModule {}
