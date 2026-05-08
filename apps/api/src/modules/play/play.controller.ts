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
import {
  PlayCompletedRequest,
  PlayStartedRequest,
  ResolveRequest,
  ResolveResponse,
} from "@moc/contracts";
import { Public } from "../../common/public.decorator.js";
import type { AuthedRequest } from "../../common/auth.guard.js";
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

  @Post("started")
  @HttpCode(HttpStatus.NO_CONTENT)
  async started(@Req() req: AuthedRequest, @Body() body: unknown): Promise<void> {
    const parsed = PlayStartedRequest.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      );
    }
    await this.playService.recordStarted(req.user!.uid, parsed.data);
  }

  @Post("completed")
  @HttpCode(HttpStatus.NO_CONTENT)
  async completed(@Req() req: AuthedRequest, @Body() body: unknown): Promise<void> {
    const parsed = PlayCompletedRequest.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      );
    }
    await this.playService.recordCompleted(req.user!.uid, parsed.data);
  }
}
