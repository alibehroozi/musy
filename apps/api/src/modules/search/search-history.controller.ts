import { Controller, Get, HttpCode, HttpStatus, Inject, Query, Req } from "@nestjs/common";
import type { HistoryResponse } from "@moc/contracts";
import type { AuthedRequest } from "../../common/auth.guard.js";
import { SearchHistoryRepository } from "./search-history.repository.js";

@Controller("search")
export class SearchHistoryController {
  constructor(
    @Inject(SearchHistoryRepository)
    private readonly historyRepository: SearchHistoryRepository,
  ) {}

  @Get("history")
  @HttpCode(HttpStatus.OK)
  async getHistory(
    @Req() req: AuthedRequest,
    @Query("cursor") cursor?: string,
    @Query("limit") limitStr?: string,
  ): Promise<HistoryResponse> {
    // AuthGuard ensures req.user is defined for non-public routes
    const userId = req.user!.uid;
    const parsed = limitStr !== undefined ? parseInt(limitStr, 10) : NaN;
    const limit = isNaN(parsed) ? 20 : parsed;
    return this.historyRepository.findByUser(userId, limit, cursor);
  }
}
