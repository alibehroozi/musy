import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { v4 as uuidv4 } from "uuid";
import type { TasteProfile } from "@moc/contracts";
import {
  buildTastePrompt,
  parseTasteProfileResponse,
  SWIPE_TRIGGER_THRESHOLD,
  type PromptListen,
  type PromptSwipe,
} from "@moc/api-core";

import { SwipesRepository } from "./explore.repository.js";
import { ListeningEventsRepository } from "../play/listening-events.repository.js";
import { TasteProfilesRepository } from "./taste-profile.repository.js";
import { AnthropicClient } from "./anthropic.client.js";
import { BucketBuilderService } from "./bucket-builder.service.js";

const REBUILD_TIME_MS = 24 * 60 * 60 * 1000;
const DEFAULT_MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 2048;

@Injectable()
export class ProfileBuilderService {
  private readonly logger = new Logger(ProfileBuilderService.name);

  // Tracks in-flight builds so concurrent callers share a single LLM call.
  // Per API-19: when QueueBuilderService.rebuildQueue races the
  // fire-and-forget maybeBuild fired from recordSwipe, it can await the
  // in-flight promise here instead of starting a duplicate build.
  private readonly inFlightBuilds = new Map<string, Promise<void>>();

  constructor(
    @Inject(SwipesRepository) private readonly swipes: SwipesRepository,
    @Inject(ListeningEventsRepository)
    private readonly listens: ListeningEventsRepository,
    @Inject(TasteProfilesRepository)
    private readonly profiles: TasteProfilesRepository,
    @Inject(AnthropicClient) private readonly anthropic: AnthropicClient,
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(BucketBuilderService) private readonly bucketBuilder: BucketBuilderService,
  ) {}

  /**
   * Fire-and-forget wrapper around buildIfDue. Called from the swipe
   * handler so user-perceived swipe latency stays low. The build itself
   * runs async; readers that need to *wait* for the result (e.g. the
   * queue refill during discovery exit) use buildIfDue directly.
   */
  async maybeBuild(userId: string): Promise<void> {
    void this.buildIfDue(userId).catch((err) => {
      this.logger.error(
        { event: "taste_profile_enqueue_failed", userId, err: errToString(err) },
        "taste_profile_enqueue_failed",
      );
    });
  }

  /**
   * Awaitable build trigger. If a build is in flight for `userId`, returns
   * its promise so the caller awaits the existing work instead of starting
   * a duplicate one. If no build is due (swipe count below threshold, or a
   * recent profile already covers the swipes), resolves immediately.
   * Otherwise starts a build and resolves when it completes (success or
   * failure — errors are logged and swallowed so callers don't have to
   * branch on build failure; they can re-read the profile to see whether
   * one is now available).
   */
  async buildIfDue(userId: string): Promise<void> {
    const inFlight = this.inFlightBuilds.get(userId);
    if (inFlight) return inFlight;

    const totalSwipes = (await this.swipes.findSwipesForUser(userId)).length;
    if (totalSwipes < SWIPE_TRIGGER_THRESHOLD) return;

    const existing = await this.profiles.findForUser(userId);
    if (existing) {
      const swipesSince = totalSwipes - existing.swipeCountAtLastBuild;
      const ageMs = Date.now() - new Date(existing.lastBuiltAt).getTime();
      if (swipesSince < SWIPE_TRIGGER_THRESHOLD && ageMs < REBUILD_TIME_MS) return;
    }

    const promise = this.runBuild(userId, totalSwipes)
      .catch((err: unknown) => {
        this.logger.error(
          { event: "taste_profile_build_failed", userId, err: errToString(err) },
          "taste_profile_build_failed",
        );
      })
      .finally(() => {
        this.inFlightBuilds.delete(userId);
      });

    this.inFlightBuilds.set(userId, promise);
    return promise;
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
      parsed = parseTasteProfileResponse(response.text);
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

    // Fire-and-forget bucket build downstream. Errors are logged inside
    // BucketBuilderService.maybeBuild and never surface to the caller.
    void this.bucketBuilder.maybeBuild(userId);
  }
}

function errToString(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  return String(err);
}
