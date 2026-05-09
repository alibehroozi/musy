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
import { ResolveRequest, type ResolveResponse } from "@moc/contracts";
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
}
