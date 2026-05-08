import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { SearchQuery, SearchResponse } from "@moc/contracts";
import { Public } from "../../common/public.decorator.js";
import type { AuthedRequest } from "../../common/auth.guard.js";
import { SearchService } from "./search.service.js";
import { SearchRateLimiterGuard } from "./search-rate-limiter.guard.js";

@Controller("search")
export class SearchController {
  constructor(@Inject(SearchService) private readonly searchService: SearchService) {}

  @Public()
  @Post()
  @HttpCode(HttpStatus.OK)
  @UseGuards(SearchRateLimiterGuard)
  async search(@Body() body: unknown, @Req() req: AuthedRequest): Promise<SearchResponse> {
    const parsed = SearchQuery.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      );
    }
    return this.searchService.search(parsed.data.q, req.user?.uid);
  }
}
