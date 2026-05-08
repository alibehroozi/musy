import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { PLAY_RESOLUTION_MODEL, PlayResolutionSchemaDefinition } from "./play.schema.js";
import { INTEREST_SCORES_MODEL, InterestScoreSchemaDefinition } from "./interest-scores.schema.js";
import {
  LISTENING_EVENTS_MODEL,
  ListeningEventSchemaDefinition,
} from "./listening-events.schema.js";
import { PlayRepository } from "./play.repository.js";
import { InterestScoresRepository } from "./interest-scores.repository.js";
import { ListeningEventsRepository } from "./listening-events.repository.js";
import { PlayService } from "./play.service.js";
import { PlayController } from "./play.controller.js";
import { AudiusStreamClient } from "./providers/audius-stream.client.js";
import { SoundCloudStreamClient } from "./providers/soundcloud-stream.client.js";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PLAY_RESOLUTION_MODEL, schema: PlayResolutionSchemaDefinition },
      { name: INTEREST_SCORES_MODEL, schema: InterestScoreSchemaDefinition },
      { name: LISTENING_EVENTS_MODEL, schema: ListeningEventSchemaDefinition },
    ]),
  ],
  controllers: [PlayController],
  providers: [
    PlayService,
    PlayRepository,
    InterestScoresRepository,
    ListeningEventsRepository,
    AudiusStreamClient,
    SoundCloudStreamClient,
  ],
})
export class PlayModule {}
