import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
} from "@nestjs/common";
import { ExploredEventRequest, SavedEventRequest } from "@moc/contracts";
import type { AuthedRequest } from "../../common/auth.guard.js";
import { InterestScoresRepository } from "./interest-scores.repository.js";

@Controller("search")
export class SearchEventsController {
  constructor(
    @Inject(InterestScoresRepository)
    private readonly repository: InterestScoresRepository,
  ) {}

  @Post("explored")
  @HttpCode(HttpStatus.NO_CONTENT)
  async explored(@Body() body: unknown, @Req() req: AuthedRequest): Promise<void> {
    const parsed = ExploredEventRequest.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      );
    }
    await this.repository.upsertEvent({
      userId: req.user!.uid,
      source: parsed.data.source,
      externalId: parsed.data.externalId,
      snapshot: parsed.data.snapshot,
      eventType: "explored",
    });
  }

  @Post("saved")
  @HttpCode(HttpStatus.NO_CONTENT)
  async saved(@Body() body: unknown, @Req() req: AuthedRequest): Promise<void> {
    const parsed = SavedEventRequest.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      );
    }
    await this.repository.upsertEvent({
      userId: req.user!.uid,
      source: parsed.data.source,
      externalId: parsed.data.externalId,
      snapshot: parsed.data.snapshot,
      eventType: "saved",
    });
  }
}
