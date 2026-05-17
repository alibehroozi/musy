import { Inject, Injectable, Logger } from "@nestjs/common";
import type { PlayEventType, ProviderName, SongSnapshot } from "@moc/contracts";
import { ListeningEventsRepository } from "./listening-events.repository.js";
import { InterestScoresRepository } from "../search/interest-scores.repository.js";
import { ScoringService } from "../taste/scoring.service.js";

interface RecordEventInput {
  userId: string;
  source: ProviderName;
  externalId: string;
  snapshot: SongSnapshot;
  elapsedMs: number;
  eventType: PlayEventType;
}

@Injectable()
export class PlayEventsService {
  private readonly logger = new Logger(PlayEventsService.name);

  constructor(
    @Inject(ListeningEventsRepository)
    private readonly listeningEvents: ListeningEventsRepository,
    @Inject(InterestScoresRepository)
    private readonly interestScores: InterestScoresRepository,
    @Inject(ScoringService) private readonly scoring: ScoringService,
  ) {}

  /**
   * Persist one play event:
   *   1. Append a row to listening_events (always — every event preserved).
   *   2. Bump the matching interest_scores doc via the max-rule:
   *      "started"  → lastEventType "explored" (semantic match, score 3)
   *      "completed" → lastEventType "completed" (score 5)
   *   3. Fire-and-forget contextual-scoring write for `completed` events
   *      that played through ≥ 50 % of the track (feature 02). The
   *      ScoringService handles the playedPct gate; failures log but
   *      never roll back the listening-events ledger.
   */
  async record(input: RecordEventInput): Promise<void> {
    await this.listeningEvents.record({
      userId: input.userId,
      source: input.source,
      externalId: input.externalId,
      eventType: input.eventType,
      elapsedMs: input.elapsedMs,
    });
    await this.interestScores.upsertEvent({
      userId: input.userId,
      source: input.source,
      externalId: input.externalId,
      snapshot: input.snapshot,
      eventType: input.eventType === "started" ? "explored" : "completed",
    });
    if (input.eventType === "completed") {
      void this.scoring
        .recordListenCompleted({
          userId: input.userId,
          source: input.source,
          externalId: input.externalId,
          snapshot: input.snapshot,
          elapsedMs: input.elapsedMs,
        })
        .catch((err) => {
          this.logger.error(
            { event: "context_score_write_failed", err: errToString(err) },
            "context_score_write_failed",
          );
        });
    }
  }
}

function errToString(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  return String(err);
}
