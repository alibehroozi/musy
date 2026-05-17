import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { BUCKETS_MODEL, BucketsSchemaDefinition } from "./buckets.schema.js";
import {
  BUCKET_SONG_SCORES_MODEL,
  BucketSongScoresSchemaDefinition,
} from "./bucket-song-scores.schema.js";
import { BucketsRepository } from "./buckets.repository.js";
import { BucketSongScoresRepository } from "./bucket-song-scores.repository.js";
import { TasteService } from "./taste.service.js";
import { TasteController } from "./taste.controller.js";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: BUCKETS_MODEL, schema: BucketsSchemaDefinition },
      { name: BUCKET_SONG_SCORES_MODEL, schema: BucketSongScoresSchemaDefinition },
    ]),
  ],
  controllers: [TasteController],
  providers: [TasteService, BucketsRepository, BucketSongScoresRepository],
})
export class TasteModule {}
