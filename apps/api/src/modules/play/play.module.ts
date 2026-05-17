import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import {
  PLAY_RESOLUTIONS_MODEL,
  PlayResolutionsSchemaDefinition,
} from "./play-resolutions.schema.js";
import {
  RESOLUTION_PREFERENCES_MODEL,
  ResolutionPreferencesSchemaDefinition,
} from "./resolution-preferences.schema.js";
import {
  LISTENING_EVENTS_MODEL,
  ListeningEventsSchemaDefinition,
} from "./listening-events.schema.js";
import { PlayRepository } from "./play.repository.js";
import { ResolutionPreferencesRepository } from "./resolution-preferences.repository.js";
import { ListeningEventsRepository } from "./listening-events.repository.js";
import { PlayService } from "./play.service.js";
import { PlayEventsService } from "./play-events.service.js";
import { PlayController } from "./play.controller.js";
import { PlayEventsController } from "./play-events.controller.js";
import { AudiusStreamClient } from "./providers/audius-stream.client.js";
import { SoundCloudStreamClient } from "./providers/soundcloud-stream.client.js";
import { SearchModule } from "../search/search.module.js";
import { TasteModule } from "../taste/taste.module.js";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PLAY_RESOLUTIONS_MODEL, schema: PlayResolutionsSchemaDefinition },
      {
        name: RESOLUTION_PREFERENCES_MODEL,
        schema: ResolutionPreferencesSchemaDefinition,
      },
      { name: LISTENING_EVENTS_MODEL, schema: ListeningEventsSchemaDefinition },
    ]),
    SearchModule,
    // TasteModule exports BucketSongScoresRepository and CustomMixJobsRepository
    // which are injected into PlayEventsService for skip attribution (feature 06).
    TasteModule,
  ],
  controllers: [PlayController, PlayEventsController],
  providers: [
    PlayService,
    PlayEventsService,
    PlayRepository,
    ResolutionPreferencesRepository,
    ListeningEventsRepository,
    AudiusStreamClient,
    SoundCloudStreamClient,
  ],
  // Re-exported so ExploreModule's ProfileBuilderService can read recent
  // listening events for the prompt without a duplicate Mongoose binding,
  // and so the queue builder can pre-resolve the top 5 items per DATA-08.
  exports: [ListeningEventsRepository, PlayService],
})
export class PlayModule {}
