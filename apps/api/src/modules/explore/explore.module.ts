import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { MongooseModule } from "@nestjs/mongoose";
import Anthropic from "@anthropic-ai/sdk";
import { ANTHROPIC_DEFAULT_FALLBACK_MODEL, anthropicAuthOptionsFor } from "@moc/api-core";
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
import { BucketBuilderService } from "./bucket-builder.service.js";
import { CustomMixService } from "./custom-mix.service.js";
import { CustomMixController } from "./custom-mix.controller.js";
import {
  AnthropicClient,
  ANTHROPIC_FALLBACK_MODEL_TOKEN,
  ANTHROPIC_SDK_TOKEN,
} from "./anthropic.client.js";
import { SearchModule } from "../search/search.module.js";
import { PlayModule } from "../play/play.module.js";
import { TasteModule } from "../taste/taste.module.js";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SWIPES_MODEL, schema: SwipesSchemaDefinition },
      { name: TASTE_PROFILES_MODEL, schema: TasteProfilesSchemaDefinition },
      { name: EXPLORE_QUEUE_MODEL, schema: ExploreQueueSchemaDefinition },
    ]),
    SearchModule,
    PlayModule,
    TasteModule,
  ],
  controllers: [ExploreController, CustomMixController],
  providers: [
    ExploreService,
    SwipesRepository,
    TasteProfilesRepository,
    ExploreQueueRepository,
    ProfileBuilderService,
    QueueBuilderService,
    BucketBuilderService,
    CustomMixService,
    AnthropicClient,
    {
      provide: ANTHROPIC_SDK_TOKEN,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new Anthropic(anthropicAuthOptionsFor(config.get<string>("ANTHROPIC_API_KEY"))),
    },
    {
      provide: ANTHROPIC_FALLBACK_MODEL_TOKEN,
      useValue: ANTHROPIC_DEFAULT_FALLBACK_MODEL,
    },
  ],
})
export class ExploreModule {}
