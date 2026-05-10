import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { v4 as uuidv4 } from "uuid";
import { TasteProfileLLMOutput, type TasteProfile } from "@moc/contracts";
import { buildTastePrompt, type PromptListen, type PromptSwipe } from "@moc/api-core";

import { SwipesRepository } from "./explore.repository.js";
import { ListeningEventsRepository } from "../play/listening-events.repository.js";
import { TasteProfilesRepository } from "./taste-profile.repository.js";
import { AnthropicClient } from "./anthropic.client.js";

const SWIPE_TRIGGER_THRESHOLD = 20;
const REBUILD_TIME_MS = 24 * 60 * 60 * 1000;
const DEFAULT_MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 2048;

@Injectable()
export class ProfileBuilderService {
  private readonly logger = new Logger(ProfileBuilderService.name);

  constructor(
    @Inject(SwipesRepository) private readonly swipes: SwipesRepository,
    @Inject(ListeningEventsRepository)
    private readonly listens: ListeningEventsRepository,
    @Inject(TasteProfilesRepository)
    private readonly profiles: TasteProfilesRepository,
    @Inject(AnthropicClient) private readonly anthropic: AnthropicClient,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  /**
   * Decide whether a fresh build is due for a user, and if so kick one off.
   * Build is fire-and-forget: the caller does not await it. On API restart
   * the in-flight Promise is lost and the next swipe re-evaluates.
   */
  async maybeBuild(userId: string): Promise<void> {
    const totalSwipes = (await this.swipes.findSwipesForUser(userId)).length;
    if (totalSwipes < SWIPE_TRIGGER_THRESHOLD) return;

    const existing = await this.profiles.findForUser(userId);
    if (existing) {
      const swipesSince = totalSwipes - existing.swipeCountAtLastBuild;
      const ageMs = Date.now() - new Date(existing.lastBuiltAt).getTime();
      if (swipesSince < SWIPE_TRIGGER_THRESHOLD && ageMs < REBUILD_TIME_MS) return;
    }

    void this.runBuild(userId, totalSwipes).catch((err) => {
      this.logger.error(
        { event: "taste_profile_build_failed", userId, err: errToString(err) },
        "taste_profile_build_failed",
      );
    });
  }

  /**
   * Returns the user's current profile, or null if they have not yet hit
   * the build threshold or the first build has not completed. The shape
   * matches `TasteProfileResponse` (TasteProfile | null).
   */
  async getProfile(userId: string): Promise<TasteProfile | null> {
    const doc = await this.profiles.findForUser(userId);
    if (!doc) return null;
    return {
      userId: doc.userId,
      genres: doc.genres.map((g) => ({ name: g.name, score: g.score })),
      artists: doc.artists.map((a) => ({ name: a.name, score: a.score })),
      tempoBucket: doc.tempoBucket,
      remixPreference: doc.remixPreference,
      summaryText: doc.summaryText,
      lastBuiltAt: new Date(doc.lastBuiltAt).toISOString(),
      swipeCountAtLastBuild: doc.swipeCountAtLastBuild,
    };
  }

  private async runBuild(userId: string, totalSwipes: number): Promise<void> {
    this.logger.log(
      { event: "taste_profile_build_started", userId },
      "taste_profile_build_started",
    );

    const swipeDocs = await this.swipes.findSwipesForUser(userId);
    const listenDocs = await this.listens.findEventsForUser(userId);
    const previous = await this.profiles.findForUser(userId);

    // Newest-first ordering — buildTastePrompt expects this for AI-03's
    // "drop oldest" truncation policy.
    const recentSwipes: PromptSwipe[] = swipeDocs
      .slice()
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .map((s) => ({
        title: s.snapshot.title,
        artist: s.snapshot.artist,
        kind: s.snapshot.kind,
        direction: s.direction,
        at: new Date(s.at).toISOString(),
      }));
    // Listening events today store provider/externalId only — they don't
    // carry a snapshot, so we have no title/artist to feed the prompt yet.
    // The shape is wired so a future epic that adds snapshots to
    // listening_events can flip this on without a prompt-builder change.
    const recentListens: PromptListen[] = [];
    void listenDocs;

    const { system, userMessage } = buildTastePrompt({
      recentSwipes,
      recentListens,
      previousSummary: previous?.summaryText ?? null,
    });

    const model = this.config.get<string>("ANTHROPIC_MODEL") ?? DEFAULT_MODEL;
    const response = await this.anthropic.complete({
      system,
      userMessage,
      model,
      maxTokens: MAX_TOKENS,
    });

    let parsed;
    try {
      const json = JSON.parse(response.text);
      parsed = TasteProfileLLMOutput.parse(json);
    } catch (err) {
      this.logger.error(
        {
          event: "taste_profile_build_failed",
          userId,
          reason: "llm_parse_failed",
          err: errToString(err),
        },
        "taste_profile_build_failed",
      );
      return;
    }

    await this.profiles.upsertForUser({
      id: previous?.id ?? uuidv4(),
      userId,
      genres: parsed.genres,
      artists: parsed.artists,
      tempoBucket: parsed.tempoBucket,
      remixPreference: parsed.remixPreference,
      summaryText: parsed.summaryText,
      lastBuiltAt: new Date(),
      swipeCountAtLastBuild: totalSwipes,
    });

    this.logger.log(
      { event: "taste_profile_build_completed", userId },
      "taste_profile_build_completed",
    );
  }
}

function errToString(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  return String(err);
}
