import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { AppModule } from "./app.module.js";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const port = config.get<number>("API_PORT", 3001);
  await app.listen(port);
  console.log(`[moc/api] listening on :${port}`);
}

bootstrap().catch((err) => {
  console.error("[moc/api] bootstrap failed", err);
  process.exit(1);
});
