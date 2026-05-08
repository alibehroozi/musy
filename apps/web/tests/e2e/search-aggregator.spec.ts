import { test, expect, mockJsonRoute, mockJsonError, expectAccessible } from "./fixtures.js";
import { SearchResponse, HistoryResponse } from "@moc/contracts";

/**
 * Feature 02: Search aggregator backend.
 * Source: product-specs/search/features/02-search-aggregator-backend.md.
 *
 * The aggregator is backend-only, but its acceptance criteria assert
 * specific response shapes (cached, partial+empty, all-providers-failed,
 * upstream error). This spec exercises each shape from the UI side so
 * the contract → render path is visually pinned.
 *
 * History calls are stubbed empty so the suggestions block is the
 * starting state for every test.
 */

const HISTORY_EMPTY = { entries: [], nextCursor: null };

const TRACK_ONLY: SearchResponse = SearchResponse.parse({
  results: [
    {
      type: "track",
      id: "deezer:track:1",
      title: "Get Lucky",
      artist: "Daft Punk",
      duration: 369,
      provider: "deezer",
      providerId: "deezer-1",
      sources: ["deezer", "audius"],
    },
    {
      type: "track",
      id: "audius:track:2",
      title: "Around the World",
      artist: "Daft Punk",
      duration: 429,
      provider: "audius",
      providerId: "audius-2",
      sources: ["audius"],
    },
  ],
  partial: false,
  failedProviders: [],
  cached: false,
});

test.describe("search aggregator backend", () => {
  test.beforeEach(async ({ page }) => {
    await mockJsonRoute(page, /\/api\/search\/history/, HistoryResponse, HISTORY_EMPTY);
  });

  // Acceptance: cached responses still render normally (cached: true).
  test("cached response (cached: true) renders results identically to a fresh response", async ({
    page,
  }) => {
    await mockJsonRoute(page, /\/api\/search$/, SearchResponse, {
      ...TRACK_ONLY,
      cached: true,
    });

    await page.goto("/search");
    await page.getByRole("textbox").fill("daft punk");
    await page.getByRole("textbox").press("Enter");

    await expect(page.getByText("Get Lucky")).toBeVisible();
    await expect(page.getByText("Around the World")).toBeVisible();
    await expect(page.getByRole("main")).toHaveScreenshot("aggregator-cached-results.png", {
      animations: "disabled",
    });
    await expectAccessible(page);
  });

  // Failure mode — all providers fail (200 + partial: true + empty results).
  test("all-providers-failed shows empty state with the unavailable hint", async ({ page }) => {
    await mockJsonRoute(page, /\/api\/search$/, SearchResponse, {
      results: [],
      partial: true,
      failedProviders: ["audius", "deezer", "radio-browser", "genius"],
      cached: false,
    });

    await page.goto("/search");
    await page.getByRole("textbox").fill("anything");
    await page.getByRole("textbox").press("Enter");

    await expect(page.getByText("No results found. Try a different query.")).toBeVisible();
    await expect(page.getByText(/Unavailable:/)).toBeVisible();
    await expect(page.getByRole("main")).toHaveScreenshot("aggregator-all-failed.png", {
      animations: "disabled",
    });
    await expectAccessible(page);
  });

  // Failure mode — partial response with one provider down still renders results.
  test("partial: true with some results shows them without the empty state", async ({ page }) => {
    await mockJsonRoute(page, /\/api\/search$/, SearchResponse, {
      ...TRACK_ONLY,
      partial: true,
      failedProviders: ["genius"],
    });

    await page.goto("/search");
    await page.getByRole("textbox").fill("daft punk");
    await page.getByRole("textbox").press("Enter");

    await expect(page.getByText("Get Lucky")).toBeVisible();
    await expect(page.getByText("No results found.")).toHaveCount(0);
    await expect(page.getByRole("main")).toHaveScreenshot("aggregator-partial-with-results.png", {
      animations: "disabled",
    });
    await expectAccessible(page);
  });

  // Failure mode — upstream error (5xx with ErrorResponse-shaped body).
  test("upstream 502 surfaces the inline retry affordance", async ({ page }) => {
    await mockJsonError(page, /\/api\/search$/, 502, {
      code: "UPSTREAM_ERROR",
      message: "Aggregator timed out",
    });

    await page.goto("/search");
    await page.getByRole("textbox").fill("queen");
    await page.getByRole("textbox").press("Enter");

    await expect(page.getByText("Couldn't search right now. Try again.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
    await expect(page.getByRole("main")).toHaveScreenshot("aggregator-upstream-error.png", {
      animations: "disabled",
    });
    await expectAccessible(page);
  });

  // Failure mode — genuine network failure (no HTTP response). Per
  // updated rule: route.abort is fine here, no body to type.
  test("network failure surfaces the inline retry affordance", async ({ page }) => {
    await page.route(/\/api\/search$/, (r) => r.abort());

    await page.goto("/search");
    await page.getByRole("textbox").fill("queen");
    await page.getByRole("textbox").press("Enter");

    await expect(page.getByText("Couldn't search right now. Try again.")).toBeVisible();
    await expect(page.getByRole("main")).toHaveScreenshot("aggregator-network-failure.png", {
      animations: "disabled",
    });
    await expectAccessible(page);
  });
});
