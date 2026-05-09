import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import {
  PLAY_RESOLUTIONS_MODEL,
  PlayResolutionsSchemaDefinition,
} from "./play-resolutions.schema.js";
import { PlayRepository } from "./play.repository.js";
import { PlayService } from "./play.service.js";
import { PlayController } from "./play.controller.js";
import { AudiusStreamClient } from "./providers/audius-stream.client.js";
import { SoundCloudStreamClient } from "./providers/soundcloud-stream.client.js";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PLAY_RESOLUTIONS_MODEL, schema: PlayResolutionsSchemaDefinition },
    ]),
  ],
  controllers: [PlayController],
  providers: [PlayService, PlayRepository, AudiusStreamClient, SoundCloudStreamClient],
})
export class PlayModule {}
