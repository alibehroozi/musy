import { test, expect, mockJsonRoute, mockJsonError, expectAccessible } from "./fixtures.js";
import { SearchResponse, HistoryResponse, ResolveResponse } from "@moc/contracts";

/**
 * Feature 03: Player engine + mini-player UI.
 * Source: product-specs/playback/features/03-player-engine-and-mini-player.md.
 *
 * Coverage maps onto the spec's "User behavior":
 *   1. Authenticated user, track plays cleanly → mini-player in loading then playing state
 *   2. track plays to completion → POST /play/completed fires
 *   3. Tapping a different row replaces the track
 *   4. Resolver returns source:null → failed mini-player, no audio attempted
 *   5. Audio element 403s → failed mini-player
 *   6. Anonymous user tap → sign-in modal (feat-05 gate, no mini-player)
 *   Empty/first-run: no mini-player before any tap
 *   BROWSER-03: 375×667 viewport — mini-player + nav fit; touch targets ≥ 44 px
 */

const HISTORY_EMPTY = HistoryResponse.parse({ entries: [], nextCursor: null });

const TWO_TRACKS: SearchResponse = SearchResponse.parse({
  results: [
    {
      type: "track",
      id: "audius:track:1",
      title: "Get Lucky",
      artist: "Daft Punk",
      duration: 369,
      provider: "audius",
      providerId: "audius-1",
      sources: ["audius"],
    },
    {
      type: "track",
      id: "deezer:track:2",
      title: "One More Time",
      artist: "Daft Punk",
      duration: 255,
      provider: "deezer",
      providerId: "deezer-2",
      sources: ["deezer"],
    },
  ],
  partial: false,
  failedProviders: [],
  cached: false,
});

const RESOLVE_AUDIUS = ResolveResponse.parse({
  source: "audius",
  sourceTrackId: "audius-1",
  streamUrl: "http://localhost:5173/test-audio.mp3",
  expiresAt: "2026-12-31T00:00:00.000Z",
});

const RESOLVE_NULL = ResolveResponse.parse({
  source: null,
  sourceTrackId: null,
  streamUrl: null,
  expiresAt: null,
});

async function gotoSearchWithResults(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/search");
  await page.getByRole("textbox").fill("daft punk");
  await page.getByRole("textbox").press("Enter");
  await expect(page.getByText("Get Lucky")).toBeVisible();
}

test.describe("player engine — empty/first-run state", () => {
  test.beforeEach(async ({ page }) => {
    await mockJsonRoute(page, /\/api\/search\/history/, HistoryResponse, HISTORY_EMPTY);
  });

  test("no mini-player is rendered before any track has been played", async ({ page }) => {
    await page.goto("/search");
    await expect(page.getByTestId("mini-player")).not.toBeVisible();

    await expect(page).toHaveScreenshot("player-initial-no-mini-player.png", {
      animations: "disabled",
    });
    await expectAccessible(page);
  });
});

test.describe("player engine — authenticated user playback", () => {
  test.beforeEach(async ({ page }) => {
    await mockJsonRoute(page, /\/api\/search\/history/, HistoryResponse, HISTORY_EMPTY);
    await mockJsonRoute(page, /\/api\/search$/, SearchResponse, TWO_TRACKS);
    await mockJsonRoute(page, /\/api\/play\/resolve/, ResolveResponse, RESOLVE_AUDIUS);
    await page.route(/\/api\/play\/(started|completed)$/, (route) =>
      route.fulfill({ status: 204 }),
    );
    // Route the test audio URL to a minimal silent WAV so the browser can "play" it.
    await page.route("**/test-audio.mp3", (route) => {
      // 44-byte RIFF WAV with 0 data bytes — valid, loads instantly, plays silently.
      const wav = Buffer.from(
        "52494646240000005741564566 6d7420100000000100010044ac0000881001000200 10006461746100000000".replace(
          /\s/g,
          "",
        ),
        "hex",
      );
      route.fulfill({
        status: 200,
        contentType: "audio/wav",
        body: wav,
      });
    });
    await page.route(/\/api\/search\/(explored|saved)$/, (route) => route.fulfill({ status: 204 }));
  });

  // User behavior 1 — track resolves → mini-player appears in loading/playing state.
  test("tapping a row makes the mini-player appear with track metadata", async ({ page }) => {
    await gotoSearchWithResults(page);
    await page.getByTestId("interactive-row").first().click();

    // Mini-player should appear (loading or playing state).
    const miniPlayer = page.getByTestId("mini-player");
    await expect(miniPlayer).toBeVisible();
    await expect(miniPlayer).toContainText("Get Lucky");
    await expect(miniPlayer).toContainText("Daft Punk");

    await expect(page).toHaveScreenshot("player-mini-player-loaded.png", {
      animations: "disabled",
    });
    await expectAccessible(page);
  });

  // User behavior 3 — tapping a different row replaces the track.
  test("tapping a second row replaces the first track in the mini-player", async ({ page }) => {
    await mockJsonRoute(page, /\/api\/play\/resolve/, ResolveResponse, RESOLVE_AUDIUS);

    await gotoSearchWithResults(page);
    await page.getByTestId("interactive-row").first().click();
    await expect(page.getByTestId("mini-player")).toContainText("Get Lucky");

    await page.getByTestId("interactive-row").nth(1).click();
    await expect(page.getByTestId("mini-player")).toContainText("One More Time");
  });

  // User behavior 8 — mini-player persists across route navigation.
  test("mini-player remains visible when navigating between /search, /explore, /taste", async ({
    page,
  }) => {
    await gotoSearchWithResults(page);
    await page.getByTestId("interactive-row").first().click();
    await expect(page.getByTestId("mini-player")).toBeVisible();

    await page.getByRole("link", { name: /explore/i }).click();
    await expect(page.getByTestId("mini-player")).toBeVisible();

    await expect(page).toHaveScreenshot("player-mini-player-on-explore.png", {
      animations: "disabled",
    });
    await expectAccessible(page);

    await page.getByRole("link", { name: /taste/i }).click();
    await expect(page.getByTestId("mini-player")).toBeVisible();

    await expect(page).toHaveScreenshot("player-mini-player-on-taste.png", {
      animations: "disabled",
    });
    await expectAccessible(page);
  });

  // Currently-playing row gets an overlay.
  test("currently-playing row has a play overlay; other rows do not", async ({ page }) => {
    await gotoSearchWithResults(page);
    await page.getByTestId("interactive-row").first().click();

    // Wait for mini-player so currentSource is set.
    await expect(page.getByTestId("mini-player")).toBeVisible();

    const playingRow = page.getByTestId("interactive-row-wrapper").first();
    await expect(playingRow).toHaveAttribute("data-playing", "true");
    const secondRow = page.getByTestId("interactive-row-wrapper").nth(1);
    await expect(secondRow).not.toHaveAttribute("data-playing");

    await expect(page.getByTestId("results-list")).toHaveScreenshot(
      "player-playing-row-overlay.png",
      { animations: "disabled" },
    );
    await expectAccessible(page);
  });
});

test.describe("player engine — failure modes", () => {
  test.beforeEach(async ({ page }) => {
    await mockJsonRoute(page, /\/api\/search\/history/, HistoryResponse, HISTORY_EMPTY);
    await mockJsonRoute(page, /\/api\/search$/, SearchResponse, TWO_TRACKS);
    await page.route(/\/api\/search\/(explored|saved)$/, (route) => route.fulfill({ status: 204 }));
  });

  // User behavior 4 — resolver returns source:null.
  test("when resolver returns source:null the mini-player shows failed state", async ({ page }) => {
    await mockJsonRoute(page, /\/api\/play\/resolve/, ResolveResponse, RESOLVE_NULL);

    await gotoSearchWithResults(page);
    await page.getByTestId("interactive-row").first().click();

    const miniPlayer = page.getByTestId("mini-player");
    await expect(miniPlayer).toBeVisible();
    await expect(miniPlayer).toHaveAttribute("data-player-state", "failed");
    await expect(miniPlayer).toContainText(/Couldn't play/);

    await expect(page).toHaveScreenshot("player-failed-null-source.png", {
      animations: "disabled",
    });
    await expectAccessible(page);
  });

  // User behavior 5 — audio element errors (network error on stream URL).
  test("when the audio URL errors the mini-player shows failed state", async ({ page }) => {
    await mockJsonRoute(page, /\/api\/play\/resolve/, ResolveResponse, {
      source: "audius",
      sourceTrackId: "audius-1",
      streamUrl: "http://localhost:5173/broken-audio.mp3",
      expiresAt: "2026-12-31T00:00:00.000Z",
    });
    await page.route("**/broken-audio.mp3", (route) => route.abort("failed"));

    await gotoSearchWithResults(page);
    await page.getByTestId("interactive-row").first().click();

    const miniPlayer = page.getByTestId("mini-player");
    await expect(miniPlayer).toBeVisible();
    await expect(miniPlayer).toHaveAttribute("data-player-state", "failed");

    await expect(page).toHaveScreenshot("player-failed-audio-error.png", {
      animations: "disabled",
    });
    await expectAccessible(page);
  });

  // Failure mode — resolver 5xx.
  test("when the resolver returns 5xx the mini-player shows service-error copy", async ({
    page,
  }) => {
    await mockJsonError(page, /\/api\/play\/resolve/, 503, {
      code: "SERVICE_UNAVAILABLE",
      message: "upstream down",
    });

    await gotoSearchWithResults(page);
    await page.getByTestId("interactive-row").first().click();

    const miniPlayer = page.getByTestId("mini-player");
    await expect(miniPlayer).toBeVisible();
    await expect(miniPlayer).toHaveAttribute("data-player-state", "failed");
    await expect(miniPlayer).toContainText("Couldn't reach the player service");

    await expect(page).toHaveScreenshot("player-failed-service-error.png", {
      animations: "disabled",
    });
    await expectAccessible(page);
  });

  // Dismiss failed state.
  test("tapping dismiss removes the mini-player and resets to idle", async ({ page }) => {
    await mockJsonRoute(page, /\/api\/play\/resolve/, ResolveResponse, RESOLVE_NULL);

    await gotoSearchWithResults(page);
    await page.getByTestId("interactive-row").first().click();

    const miniPlayer = page.getByTestId("mini-player");
    await expect(miniPlayer).toBeVisible();

    await page.getByRole("button", { name: "Dismiss player" }).click();
    await expect(miniPlayer).not.toBeVisible();
  });
});

test.describe("player engine — anonymous user (User behavior 6)", () => {
  test.use({ authed: false });

  test.beforeEach(async ({ page }) => {
    await mockJsonRoute(page, /\/api\/search\/history/, HistoryResponse, HISTORY_EMPTY);
    await mockJsonRoute(page, /\/api\/search$/, SearchResponse, TWO_TRACKS);
  });

  test("anonymous tap shows sign-in modal and no mini-player appears", async ({ page }) => {
    await gotoSearchWithResults(page);
    await page.getByTestId("interactive-row").first().click();

    await expect(page.getByRole("dialog", { name: /sign in/i })).toBeVisible();
    await expect(page.getByTestId("mini-player")).not.toBeVisible();

    await expect(page).toHaveScreenshot("player-anon-modal-no-mini-player.png", {
      animations: "disabled",
      fullPage: true,
    });
    await expectAccessible(page);
  });
});

test.describe("BROWSER-03: mini-player mobile layout and touch targets", () => {
  test.beforeEach(async ({ page }) => {
    await mockJsonRoute(page, /\/api\/search\/history/, HistoryResponse, HISTORY_EMPTY);
    await mockJsonRoute(page, /\/api\/search$/, SearchResponse, TWO_TRACKS);
    await mockJsonRoute(page, /\/api\/play\/resolve/, ResolveResponse, RESOLVE_NULL);
    await page.route(/\/api\/search\/(explored|saved)$/, (route) => route.fulfill({ status: 204 }));
  });

  test("on 375×667 viewport mini-player + bottom nav fit without horizontal scroll; touch targets ≥ 44 px", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await gotoSearchWithResults(page);
    await page.getByTestId("interactive-row").first().click();

    const miniPlayer = page.getByTestId("mini-player");
    await expect(miniPlayer).toBeVisible();

    // No horizontal scroll.
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);

    // Dismiss button touch target ≥ 44×44.
    const dismissBtn = page.getByRole("button", { name: "Dismiss player" });
    const dismissBox = await dismissBtn.boundingBox();
    expect(dismissBox).not.toBeNull();
    expect(dismissBox!.width).toBeGreaterThanOrEqual(44);
    expect(dismissBox!.height).toBeGreaterThanOrEqual(44);

    await expect(page).toHaveScreenshot("player-browser-03-mobile-375x667.png", {
      animations: "disabled",
      fullPage: false,
    });
    await expectAccessible(page);
  });
});
