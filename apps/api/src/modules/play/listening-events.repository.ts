import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import {
  LISTENING_EVENTS_MODEL,
  type ListeningEventType,
  type ListeningEventDocument,
} from "./listening-events.schema.js";

@Injectable()
export class ListeningEventsRepository {
  constructor(
    @InjectModel(LISTENING_EVENTS_MODEL) private readonly model: Model<ListeningEventDocument>,
  ) {}

  async insert(
    userId: string,
    source: string,
    externalId: string,
    eventType: ListeningEventType,
    elapsedMs: number,
  ): Promise<void> {
    const songKey = `${source}:${externalId}`;
    await this.model.create({
      userId,
      source,
      externalId,
      songKey,
      eventType,
      elapsedMs,
      at: new Date(),
    });
  }
}
