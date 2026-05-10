import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { TASTE_PROFILES_MODEL, type TasteProfileDocument } from "./taste-profile.schema.js";

export interface TasteProfileUpsert {
  id: string;
  userId: string;
  genres: { name: string; score: number }[];
  artists: { name: string; score: number }[];
  tempoBucket: TasteProfileDocument["tempoBucket"];
  remixPreference: TasteProfileDocument["remixPreference"];
  summaryText: string;
  lastBuiltAt: Date;
  swipeCountAtLastBuild: number;
}

@Injectable()
export class TasteProfilesRepository {
  constructor(
    @InjectModel(TASTE_PROFILES_MODEL)
    private readonly model: Model<TasteProfileDocument>,
  ) {}

  /** SEC-10: every read is scoped by the authenticated session's userId. */
  async findForUser(userId: string): Promise<TasteProfileDocument | null> {
    return this.model.findOne({ userId }).lean().exec() as unknown as TasteProfileDocument | null;
  }

  /** Upsert keyed on userId — DATA-11 enforces one profile per user. */
  async upsertForUser(input: TasteProfileUpsert): Promise<void> {
    await this.model.updateOne({ userId: input.userId }, { $set: input }, { upsert: true }).exec();
  }
}
