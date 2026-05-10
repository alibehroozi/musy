import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { MongooseModule } from "@nestjs/mongoose";
import Anthropic from "@anthropic-ai/sdk";
import { SWIPES_MODEL, SwipesSchemaDefinition } from "./explore.schema.js";
import { TASTE_PROFILES_MODEL, TasteProfilesSchemaDefinition } from "./taste-profile.schema.js";
import { EXPLORE_QUEUE_MODEL, ExploreQueueSchemaDefinition } from "./explore-queue.schema.js";
import { SwipesRepository } from "./explore.repository.js";
import { TasteProfilesRepository } from "./taste-profile.repository.js";
import { ExploreQueueRepository } from "./explore-queue.repository.js";
import { ExploreService } from "./explore.service.js";
import { ExploreController } from "./explore.controller.js";
import { ProfileBuilderService } from "./profile-builder.service.js";
import { QueueBuilderService } from "./queue-builder.service.js";
import { AnthropicClient, ANTHROPIC_SDK_TOKEN } from "./anthropic.client.js";
import { SearchModule } from "../search/search.module.js";
import { PlayModule } from "../play/play.module.js";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SWIPES_MODEL, schema: SwipesSchemaDefinition },
      { name: TASTE_PROFILES_MODEL, schema: TasteProfilesSchemaDefinition },
      { name: EXPLORE_QUEUE_MODEL, schema: ExploreQueueSchemaDefinition },
    ]),
    SearchModule,
    PlayModule,
  ],
  controllers: [ExploreController],
  providers: [
    ExploreService,
    SwipesRepository,
    TasteProfilesRepository,
    ExploreQueueRepository,
    ProfileBuilderService,
    QueueBuilderService,
    AnthropicClient,
    {
      provide: ANTHROPIC_SDK_TOKEN,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new Anthropic({ apiKey: config.getOrThrow<string>("ANTHROPIC_API_KEY") }),
    },
  ],
})
export class ExploreModule {}
