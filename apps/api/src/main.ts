import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { AppModule } from "./app.module.js";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const port = config.get<number>("API_PORT", 3001);
  // Comma-separated list of allowed web origins. In prod, set to the deployed
  // web domain (e.g. https://musy.example.com).
  const webOrigin = config.get<string>("WEB_ORIGIN", "http://localhost:5173");
  app.enableCors({
    origin: webOrigin.split(",").map((s) => s.trim()),
    credentials: true,
  });
  await app.listen(port);
  console.log(`[musy/api] listening on :${port}`);
}

bootstrap().catch((err) => {
  console.error("[musy/api] bootstrap failed", err);
  process.exit(1);
});
