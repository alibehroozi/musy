import { Injectable, Logger } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { TasteBucket } from "@moc/contracts";
import { BUCKETS_MODEL, type BucketsDocument } from "./buckets.schema.js";

@Injectable()
export class BucketsRepository {
  private readonly logger = new Logger(BucketsRepository.name);

  constructor(
    @InjectModel(BUCKETS_MODEL)
    private readonly model: Model<BucketsDocument>,
  ) {}

  /**
   * SEC-12: every read is filtered by the authenticated session's userId.
   * Returns plain TasteBucket objects parsed through the Zod contract —
   * Mongoose internals (`_id`, `__v`) never reach the wire.
   *
   * A document missing a required field gets dropped (with a structured
   * log line) rather than 500-ing the request — the spec's "failure mode
   * the user can reach" entry for malformed DB rows.
   */
  async findForUser(userId: string): Promise<TasteBucket[]> {
    const docs = await this.model.find({ userId }).lean().exec();
    const out: TasteBucket[] = [];
    for (const doc of docs) {
      const parsed = TasteBucket.safeParse(toBucketWire(doc as unknown as BucketsDocument));
      if (parsed.success) {
        out.push(parsed.data);
      } else {
        this.logger.warn(
          {
            event: "taste_bucket_doc_dropped",
            userId,
            id: (doc as { id?: string }).id ?? null,
            issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
          },
          "taste_bucket_doc_dropped",
        );
      }
    }
    return out;
  }
}

function toBucketWire(doc: BucketsDocument): Record<string, unknown> {
  return {
    id: doc.id,
    userId: doc.userId,
    name: doc.name,
    description: doc.description ?? null,
    kind: doc.kind,
    state: doc.state,
    promptText: doc.promptText ?? null,
    errorReason: doc.errorReason ?? null,
    createdAt: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : doc.createdAt,
    lastBuiltAt: doc.lastBuiltAt instanceof Date ? doc.lastBuiltAt.toISOString() : doc.lastBuiltAt,
  };
}
