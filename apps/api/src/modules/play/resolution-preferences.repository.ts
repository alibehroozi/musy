import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import {
  RESOLUTION_PREFERENCES_MODEL,
  type ResolutionPreferencesDocument,
} from "./resolution-preferences.schema.js";

export interface ResolutionPreference {
  snapshotHash: string;
  source: "soundcloud";
  sourceTrackId: string;
  sourceLocator: string;
  score: number;
  chosenAt: Date;
}

@Injectable()
export class ResolutionPreferencesRepository {
  constructor(
    @InjectModel(RESOLUTION_PREFERENCES_MODEL)
    private readonly model: Model<ResolutionPreferencesDocument>,
  ) {}

  async findByHash(snapshotHash: string): Promise<ResolutionPreference[]> {
    const docs = await this.model.find({ snapshotHash }).lean().exec();
    return docs.map(toPreference);
  }

  async findHighestScore(snapshotHash: string): Promise<ResolutionPreference | null> {
    const doc = await this.model.findOne({ snapshotHash }).sort({ score: -1 }).lean().exec();
    return doc ? toPreference(doc) : null;
  }

  async add(input: {
    snapshotHash: string;
    sourceTrackId: string;
    sourceLocator: string;
    score: number;
    chosenAt: Date;
  }): Promise<void> {
    await this.model.create({
      snapshotHash: input.snapshotHash,
      source: "soundcloud",
      sourceTrackId: input.sourceTrackId,
      sourceLocator: input.sourceLocator,
      score: input.score,
      chosenAt: input.chosenAt,
    });
  }
}

function toPreference(
  doc: Pick<
    ResolutionPreferencesDocument,
    "snapshotHash" | "sourceTrackId" | "sourceLocator" | "score" | "chosenAt"
  >,
): ResolutionPreference {
  return {
    snapshotHash: doc.snapshotHash,
    source: "soundcloud",
    sourceTrackId: doc.sourceTrackId,
    sourceLocator: doc.sourceLocator,
    score: doc.score,
    chosenAt: doc.chosenAt,
  };
}
