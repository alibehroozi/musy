import { Schema, Document } from "mongoose";

export const LISTENING_EVENTS_MODEL = "ListeningEvent";

export type ListeningEventType = "started" | "completed";

export interface ListeningEventDocument extends Document {
  userId: string;
  source: string;
  externalId: string;
  songKey: string;
  eventType: ListeningEventType;
  elapsedMs: number;
  at: Date;
}

export const ListeningEventSchemaDefinition = new Schema<ListeningEventDocument>(
  {
    userId: { type: String, required: true },
    source: { type: String, required: true },
    externalId: { type: String, required: true },
    songKey: { type: String, required: true },
    eventType: { type: String, required: true },
    elapsedMs: { type: Number, required: true, min: 0 },
    at: { type: Date, required: true },
  },
  { collection: "listening_events", versionKey: false },
);

ListeningEventSchemaDefinition.index({ userId: 1, songKey: 1, at: 1 });
