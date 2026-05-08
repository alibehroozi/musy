import { Injectable, Logger, Inject } from "@nestjs/common";
import type { SearchResponse, SearchResult, ProviderName } from "@moc/contracts";
import { dedupeAndMerge, withTimeout, computeQueryHash, normalizeQuery } from "@moc/api-core";
import { AudiusClient } from "./providers/audius.client.js";
import { DeezerClient } from "./providers/deezer.client.js";
import { RadioBrowserClient } from "./providers/radio-browser.client.js";
import { GeniusClient } from "./providers/genius.client.js";
import { SearchRepository } from "./search.repository.js";
import { SearchHistoryRepository } from "./search-history.repository.js";

const PROVIDER_TIMEOUT_MS = 2500;

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    @Inject(AudiusClient) private readonly audius: AudiusClient,
    @Inject(DeezerClient) private readonly deezer: DeezerClient,
    @Inject(RadioBrowserClient) private readonly radioBrowser: RadioBrowserClient,
    @Inject(GeniusClient) private readonly genius: GeniusClient,
    @Inject(SearchRepository) private readonly repository: SearchRepository,
    @Inject(SearchHistoryRepository)
    private readonly historyRepository: SearchHistoryRepository,
  ) {}

  async search(rawQuery: string, userId?: string): Promise<SearchResponse> {
    const query = normalizeQuery(rawQuery);
    const hash = computeQueryHash(query);

    // Best-effort history upsert — runs regardless of cache status
    if (userId) {
      this.historyRepository.upsert(userId, query).catch((err: unknown) => {
        this.logger.warn(`History write failed: ${String(err)}`);
      });
    }

    const cached = await this.repository.findByHash(hash);
    if (cached) {
      return {
        results: cached.results,
        partial: cached.failedProviders.length > 0,
        failedProviders: cached.failedProviders,
        cached: true,
      };
    }

    const [audiusResult, deezerResult, radioResult, geniusResult] = await Promise.allSettled([
      withTimeout(this.audius.search(query), PROVIDER_TIMEOUT_MS),
      withTimeout(this.deezer.search(query), PROVIDER_TIMEOUT_MS),
      withTimeout(this.radioBrowser.search(query), PROVIDER_TIMEOUT_MS),
      withTimeout(this.genius.search(query), PROVIDER_TIMEOUT_MS),
    ]);

    const allResults: SearchResult[] = [];
    const failedProviders: ProviderName[] = [];

    const providerResults: Array<[PromiseSettledResult<SearchResult[]>, ProviderName]> = [
      [audiusResult, "audius"],
      [deezerResult, "deezer"],
      [radioResult, "radio-browser"],
      [geniusResult, "genius"],
    ];

    for (const [result, name] of providerResults) {
      if (result.status === "fulfilled") {
        allResults.push(...result.value);
      } else {
        this.logger.warn(`Provider ${name} failed: ${String(result.reason)}`);
        failedProviders.push(name);
      }
    }

    const merged = dedupeAndMerge(allResults);

    // Best-effort cache write — never fail the response on a cache error
    this.repository.save(hash, query, merged, failedProviders).catch((err: unknown) => {
      this.logger.warn(`Cache write failed: ${String(err)}`);
    });

    return {
      results: merged,
      partial: failedProviders.length > 0,
      failedProviders,
      cached: false,
    };
  }
}
