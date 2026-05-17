import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { BUCKETS_MODEL, BucketsSchemaDefinition } from "./buckets.schema.js";
import {
  BUCKET_SONG_SCORES_MODEL,
  BucketSongScoresSchemaDefinition,
} from "./bucket-song-scores.schema.js";
import { CONTEXT_SCORES_MODEL, ContextScoresSchemaDefinition } from "./context-scores.schema.js";
import { CUSTOM_MIX_JOBS_MODEL, CustomMixJobsSchemaDefinition } from "./custom-mix-jobs.schema.js";
import { BucketsRepository } from "./buckets.repository.js";
import { BucketSongScoresRepository } from "./bucket-song-scores.repository.js";
import { ContextScoresRepository } from "./context-scores.repository.js";
import { CustomMixJobsRepository } from "./custom-mix-jobs.repository.js";
import { ScoringService } from "./scoring.service.js";
import { TasteService } from "./taste.service.js";
import { TasteController } from "./taste.controller.js";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: BUCKETS_MODEL, schema: BucketsSchemaDefinition },
      { name: BUCKET_SONG_SCORES_MODEL, schema: BucketSongScoresSchemaDefinition },
      { name: CONTEXT_SCORES_MODEL, schema: ContextScoresSchemaDefinition },
      { name: CUSTOM_MIX_JOBS_MODEL, schema: CustomMixJobsSchemaDefinition },
    ]),
  ],
  controllers: [TasteController],
  providers: [
    TasteService,
    BucketsRepository,
    BucketSongScoresRepository,
    ContextScoresRepository,
    CustomMixJobsRepository,
    ScoringService,
  ],
  exports: [
    ScoringService,
    BucketsRepository,
    BucketSongScoresRepository,
    ContextScoresRepository,
    CustomMixJobsRepository,
  ],
})
export class TasteModule {}
