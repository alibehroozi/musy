import { Controller, Get, Inject, Req } from "@nestjs/common";
import type { TasteBucketsResponse } from "@moc/contracts";
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
}
