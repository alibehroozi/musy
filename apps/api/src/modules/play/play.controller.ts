import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ReresolveRequest, ResolveRequest, type ResolveResponse } from "@moc/contracts";
import { Public } from "../../common/public.decorator.js";
import { PlayService } from "./play.service.js";
import { PlayRateLimiterGuard } from "./play-rate-limiter.guard.js";

@Controller("play")
export class PlayController {
  constructor(@Inject(PlayService) private readonly playService: PlayService) {}

  @Public()
  @Post("resolve")
  @HttpCode(HttpStatus.OK)
  @UseGuards(PlayRateLimiterGuard)
  async resolve(@Body() body: unknown): Promise<ResolveResponse> {
    const parsed = ResolveRequest.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      );
    }
    return this.playService.resolve(parsed.data.snapshot);
  }

  // API-22: NOT @Public() — the global AuthGuard rejects callers without a
  // valid session cookie with 401 + ErrorResponse. Anti-abuse only; the
  // persisted preference is still global per DATA-14 (no userId on the doc).
  @Post("reresolve")
  @HttpCode(HttpStatus.OK)
  @UseGuards(PlayRateLimiterGuard)
  async reresolve(@Body() body: unknown): Promise<ResolveResponse> {
    const parsed = ReresolveRequest.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      );
    }
    return this.playService.reresolve(parsed.data.snapshot, parsed.data.currentSourceTrackId);
  }
}
