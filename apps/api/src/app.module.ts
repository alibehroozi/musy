import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { MongooseModule } from "@nestjs/mongoose";
import { UsersModule } from "./modules/users/users.module.js";
import { HealthController } from "./health.controller.js";

@Module({
  imports: [
    // In dev, loads apps/api/.env (cwd is apps/api/ when npm run dev:api runs).
    // In prod, no .env file is loaded — vars come from the host's process env.
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ".env" }),
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
