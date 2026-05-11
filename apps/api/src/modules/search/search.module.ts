import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { SEARCH_CACHE_MODEL, SearchCacheSchemaDefinition } from "./search-cache.schema.js";
import { SEARCH_HISTORY_MODEL, SearchHistorySchemaDefinition } from "./search-history.schema.js";
import { INTEREST_SCORES_MODEL, InterestScoresSchemaDefinition } from "./interest-scores.schema.js";
import { SearchRepository } from "./search.repository.js";
import { SearchHistoryRepository } from "./search-history.repository.js";
import { InterestScoresRepository } from "./interest-scores.repository.js";
import { SearchService } from "./search.service.js";
import { SearchController } from "./search.controller.js";
import { SearchHistoryController } from "./search-history.controller.js";
import { SearchEventsController } from "./search-events.controller.js";
import { AudiusClient } from "./providers/audius.client.js";
import { DeezerClient } from "./providers/deezer.client.js";
import { RadioBrowserClient } from "./providers/radio-browser.client.js";
import { GeniusClient } from "./providers/genius.client.js";
import { SoundCloudClient } from "./providers/soundcloud.client.js";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SEARCH_CACHE_MODEL, schema: SearchCacheSchemaDefinition },
      { name: SEARCH_HISTORY_MODEL, schema: SearchHistorySchemaDefinition },
      { name: INTEREST_SCORES_MODEL, schema: InterestScoresSchemaDefinition },
    ]),
  ],
  controllers: [SearchController, SearchHistoryController, SearchEventsController],
  providers: [
    SearchService,
    SearchRepository,
    SearchHistoryRepository,
    InterestScoresRepository,
    AudiusClient,
    DeezerClient,
    RadioBrowserClient,
    GeniusClient,
    SoundCloudClient,
  ],
  // ExploreModule's queue builder injects AudiusClient + SoundCloudClient
  // for per-genre / per-artist candidate sourcing, and SearchService for
  // resolving covers on candidates the per-provider step couldn't enrich.
  exports: [InterestScoresRepository, AudiusClient, SoundCloudClient, SearchService],
})
export class SearchModule {}
