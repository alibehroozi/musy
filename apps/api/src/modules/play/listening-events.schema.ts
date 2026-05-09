import { Schema, Document } from "mongoose";
import type { PlayEventType, ProviderName } from "@moc/contracts";

export const LISTENING_EVENTS_MODEL = "ListeningEvents";

export interface ListeningEventsDocument extends Document {
  userId: string;
  source: ProviderName;
  externalId: string;
  songKey: string;
  eventType: PlayEventType;
  elapsedMs: number;
  at: Date;
}

export const ListeningEventsSchemaDefinition = new Schema<ListeningEventsDocument>(
  {
    userId: { type: String, required: true },
    source: { type: String, required: true },
    externalId: { type: String, required: true },
    songKey: { type: String, required: true },
    eventType: { type: String, required: true, enum: ["started", "completed"] },
    elapsedMs: { type: Number, required: true, min: 0 },
    at: { type: Date, required: true },
  },
  { collection: "listening_events", versionKey: false },
);

// Compound index for owner-scoped reads ordered by recency. DATA-09.
ListeningEventsSchemaDefinition.index({ userId: 1, songKey: 1, at: 1 });
