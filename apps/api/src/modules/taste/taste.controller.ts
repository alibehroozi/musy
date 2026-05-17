import { Controller, Get, Inject, Param, Req } from "@nestjs/common";
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
   * API-29 / SEC-18: bucket detail by id. The session's `uid` is the
   * only `userId` source — any `userId`-shaped path/query/body/header
   * is ignored. The service raises NotFoundException (→ 404 +
   * ErrorResponse via the global filter) when the bucket does not
   * exist OR belongs to another user; both cases collapse to the same
   * body so a probing client gets no oracle.
   */
  @Get("buckets/:bucketId")
  async bucketDetail(
    @Req() req: AuthedRequest,
    @Param("bucketId") bucketId: string,
  ): Promise<BucketDetailResponse> {
    return await this.service.getBucketDetail(req.user!.uid, bucketId);
  }
}
