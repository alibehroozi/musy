import { Inject, Injectable } from "@nestjs/common";
import type { TasteBucketsResponse } from "@moc/contracts";
import { BucketsRepository } from "./buckets.repository.js";

@Injectable()
export class TasteService {
  constructor(@Inject(BucketsRepository) private readonly buckets: BucketsRepository) {}

  /**
   * API-24: returns `{ buckets: [] }` for a user with no buckets — never
   * `null`, never an empty body. SEC-12: scope every read by the session's
   * userId.
   */
  async getProfile(userId: string): Promise<TasteBucketsResponse> {
    const buckets = await this.buckets.findForUser(userId);
    return { buckets };
  }
}
