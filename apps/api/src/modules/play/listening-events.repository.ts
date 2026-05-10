import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import type { PlayEventType, ProviderName } from "@moc/contracts";
import { songKeyOf } from "@moc/api-core";
import { LISTENING_EVENTS_MODEL, type ListeningEventsDocument } from "./listening-events.schema.js";

export interface ListeningEventInput {
  userId: string;
  source: ProviderName;
  externalId: string;
  eventType: PlayEventType;
  elapsedMs: number;
}

@Injectable()
export class ListeningEventsRepository {
  constructor(
    @InjectModel(LISTENING_EVENTS_MODEL)
    private readonly model: Model<ListeningEventsDocument>,
  ) {}

  /**
   * Append a raw event row. Each call writes a new document — listening
   * events are an append-only log; the (userId, songKey)-level summary
   * lives in interest_scores.
   */
  async record(input: ListeningEventInput): Promise<void> {
    await this.model.create({
      userId: input.userId,
      source: input.source,
      externalId: input.externalId,
      songKey: songKeyOf(input.source, input.externalId),
      eventType: input.eventType,
      elapsedMs: input.elapsedMs,
      at: new Date(),
    });
  }

  /** SEC-08: every read is scoped by the authenticated session's userId. */
  async findEventsForUser(userId: string): Promise<ListeningEventsDocument[]> {
    return this.model.find({ userId }).lean().exec() as unknown as ListeningEventsDocument[];
  }
}
