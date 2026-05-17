import { Controller, Get, Inject, NotFoundException, Param, Req } from "@nestjs/common";
import type { BucketDetailResponse, TasteBucketsResponse } from "@moc/contracts";
import type { AuthedRequest } from "../../common/auth.guard.js";
import { TasteService } from "./taste.service.js";

@Controller("me/taste")
export class TasteController {
  constructor(@Inject(TasteService) private readonly service: TasteService) {}

  /**
   * API-24: returns 200 + `TasteBucketsResponse` for an authenticated
   * caller. SEC-12: userId always comes from the session — never a
   * query param or body. The global AuthGuard enforces 401 + ErrorResponse
   * for unauthenticated callers before this method runs.
   */
  @Get("profile")
  async profile(@Req() req: AuthedRequest): Promise<TasteBucketsResponse> {
    return await this.service.getProfile(req.user!.uid);
  }

  /**
   * API-29 / SEC-18: returns 200 + BucketDetailResponse for an
   * authenticated owner. Returns 404 when the bucket doesn't exist or
   * belongs to a different user — the service never returns another
   * user's data; null always maps to 404 here.
   */
  @Get("buckets/:bucketId")
  async bucketDetail(
    @Param("bucketId") bucketId: string,
    @Req() req: AuthedRequest,
  ): Promise<BucketDetailResponse> {
    const result = await this.service.getBucketDetail(req.user!.uid, bucketId);
    if (!result) throw new NotFoundException();
    return result;
  }
}
