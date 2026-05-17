import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Logger,
  Post,
  Req,
} from "@nestjs/common";
import { ExploredEventRequest, SavedEventRequest } from "@moc/contracts";
import type { AuthedRequest } from "../../common/auth.guard.js";
import { InterestScoresRepository } from "./interest-scores.repository.js";
import { ScoringService } from "../taste/scoring.service.js";

@Controller("search")
export class SearchEventsController {
  private readonly logger = new Logger(SearchEventsController.name);

  constructor(
    @Inject(InterestScoresRepository)
    private readonly repository: InterestScoresRepository,
    @Inject(ScoringService) private readonly scoring: ScoringService,
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
    const userId = req.user!.uid;
    await this.repository.upsertEvent({
      userId,
      source: parsed.data.source,
      externalId: parsed.data.externalId,
      snapshot: parsed.data.snapshot,
      eventType: "saved",
    });
    // Fire-and-forget contextual-scoring write (feature 02). The
    // saved-event ledger above is the source of truth — if the
    // scoring write fails we log and move on.
    void this.scoring
      .recordSave({
        userId,
        source: parsed.data.source,
        externalId: parsed.data.externalId,
      })
      .catch((err) => {
        this.logger.error(
          {
            event: "context_score_write_failed",
            err: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
          },
          "context_score_write_failed",
        );
      });
  }
}
