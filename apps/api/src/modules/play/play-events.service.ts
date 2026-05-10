import { Inject, Injectable } from "@nestjs/common";
import type { PlayEventType, ProviderName, SongSnapshot } from "@moc/contracts";
import { ListeningEventsRepository } from "./listening-events.repository.js";
import { InterestScoresRepository } from "../search/interest-scores.repository.js";

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
  constructor(
    @Inject(ListeningEventsRepository)
    private readonly listeningEvents: ListeningEventsRepository,
    @Inject(InterestScoresRepository)
    private readonly interestScores: InterestScoresRepository,
  ) {}

  /**
   * Persist one play event:
   *   1. Append a row to listening_events (always — every event preserved).
   *   2. Bump the matching interest_scores doc via the max-rule:
   *      "started"  → lastEventType "explored" (semantic match, score 3)
   *      "completed" → lastEventType "completed" (score 5)
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
  }
}
