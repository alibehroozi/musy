import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { SEARCH_CACHE_MODEL, SearchCacheSchemaDefinition } from "./search-cache.schema.js";
import { SEARCH_HISTORY_MODEL, SearchHistorySchemaDefinition } from "./search-history.schema.js";
import { SearchRepository } from "./search.repository.js";
import { SearchHistoryRepository } from "./search-history.repository.js";
import { SearchService } from "./search.service.js";
import { SearchController } from "./search.controller.js";
import { SearchHistoryController } from "./search-history.controller.js";
import { AudiusClient } from "./providers/audius.client.js";
import { DeezerClient } from "./providers/deezer.client.js";
import { RadioBrowserClient } from "./providers/radio-browser.client.js";
import { GeniusClient } from "./providers/genius.client.js";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SEARCH_CACHE_MODEL, schema: SearchCacheSchemaDefinition },
      { name: SEARCH_HISTORY_MODEL, schema: SearchHistorySchemaDefinition },
    ]),
  ],
  controllers: [SearchController, SearchHistoryController],
  providers: [
    SearchService,
    SearchRepository,
    SearchHistoryRepository,
    AudiusClient,
    DeezerClient,
    RadioBrowserClient,
    GeniusClient,
  ],
})
export class SearchModule {}
