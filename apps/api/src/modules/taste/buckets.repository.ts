import { Injectable, Logger } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { type BucketKind, type BucketState, TasteBucket } from "@moc/contracts";
import { BUCKETS_MODEL, type BucketsDocument } from "./buckets.schema.js";

@Injectable()
export class BucketsRepository {
  private readonly logger = new Logger(BucketsRepository.name);

  constructor(
    @InjectModel(BUCKETS_MODEL)
    private readonly model: Model<BucketsDocument>,
  ) {}

  /**
   * Insert a new bucket document for the auto-bucket builder.
   * SEC-15: userId comes from the caller; never from external input.
   */
  async insertBucket(input: {
    id: string;
    userId: string;
    name: string;
    description: string | null;
    kind: BucketKind;
    state: BucketState;
    createdAt: Date;
    lastBuiltAt: Date;
  }): Promise<void> {
    await this.model.create({
      id: input.id,
      userId: input.userId,
      name: input.name,
      description: input.description ?? null,
      kind: input.kind,
      state: input.state,
      promptText: null,
      errorReason: null,
      createdAt: input.createdAt,
      lastBuiltAt: input.lastBuiltAt,
    });
  }

  /**
   * Insert a custom-mix bucket pre-LLM (DATA-20). `kind` is always
   * `"custom"` and `state` is always `"building"` — the LLM build path
   * later flips the state via `markCustomReady` / `markCustomFailed`.
   *
   * `name` is seeded from `promptText` (truncated to 60 chars, with a
   * `"Custom mix"` fallback if the prompt is whitespace-only). This
   * keeps DATA-15's "non-empty name" invariant intact during the
   * building window and gives the polling UI something to render while
   * the LLM call is in flight; the LLM-supplied name overwrites it on
   * `markCustomReady`.
   *
   * SEC-16: userId comes from the caller; never from request body or
   * LLM output.
   */
  async insertCustomBucket(input: {
    id: string;
    userId: string;
    promptText: string;
    createdAt: Date;
  }): Promise<void> {
    const initialName = input.promptText.trim().slice(0, 60) || "Custom mix";
    await this.model.create({
      id: input.id,
      userId: input.userId,
      name: initialName,
      description: "",
      kind: "custom" satisfies BucketKind,
      state: "building" satisfies BucketState,
      promptText: input.promptText,
      errorReason: null,
      createdAt: input.createdAt,
      lastBuiltAt: input.createdAt,
    });
  }

  /**
   * Flip a custom-mix bucket from `state: "building"` to `state: "ready"`,
   * applying the LLM-supplied name + description. Scoped to the caller's
   * userId so a stray bucketId collision (shouldn't happen — uuid v4) on
   * a different user cannot be mutated.
   */
  async markCustomReady(input: {
    userId: string;
    bucketId: string;
    name: string;
    description: string;
    lastBuiltAt: Date;
  }): Promise<void> {
    await this.model
      .updateOne(
        { userId: input.userId, id: input.bucketId },
        {
          $set: {
            name: input.name,
            description: input.description,
            state: "ready" satisfies BucketState,
            lastBuiltAt: input.lastBuiltAt,
          },
        },
      )
      .exec();
  }

  /**
   * Flip a custom-mix bucket to `state: "failed"` with a non-null
   * errorReason. The row stays in place so the polling client can
   * surface the failure to the user; the user can dismiss it or
   * submit a fresh prompt to retry.
   */
  async markCustomFailed(input: {
    userId: string;
    bucketId: string;
    errorReason: string;
  }): Promise<void> {
    await this.model
      .updateOne(
        { userId: input.userId, id: input.bucketId },
        {
          $set: {
            state: "failed" satisfies BucketState,
            errorReason: input.errorReason,
          },
        },
      )
      .exec();
  }

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
    // API-28: `buckets` documents don't store the cover URL — it's a
    // read-time join from `bucket_song_scores`. The repository emits null
    // here so the Zod parse satisfies the contract; the taste.service
    // layer overwrites with the actual top-scored song's coverUrl
    // (single source of truth).
    coverArtworkUrl: null,
  };
}
