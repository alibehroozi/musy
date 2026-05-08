import { test, expect, mockJsonRoute, expectAccessible } from "./fixtures.js";
import { SearchResponse, HistoryResponse, ErrorResponse } from "@moc/contracts";

/**
 * Feature 03: Search page UI — input + results.
 * Source: product-specs/search/features/03-search-page-ui.md.
 *
 * One screenshot per visible state change in the spec's User behavior:
 *  - 1. Empty state — suggestions block visible
 *  - 2. Tapping a suggestion populates the input + runs a search
 *  - 3. Loading skeleton on submit
 *  - 4. Results list rendered (track + station, distinguishable)
 *  - 6. Clearing the input returns to suggestions
 *  - 7. Empty submit is a no-op
 * Plus failure modes (separate tests):
 *  - All providers failed → empty results state
 *  - Network down → inline retry
 * History calls are stubbed empty so suggestions (not history) are
 * the starting state.
 */

const HISTORY_EMPTY = { entries: [], nextCursor: null };

const TRACK_AND_STATION: SearchResponse = SearchResponse.parse({
  results: [
    {
      type: "track",
      id: "deezer:track:1",
      title: "Get Lucky",
      artist: "Daft Punk",
      duration: 369,
      provider: "deezer",
      providerId: "deezer-1",
      sources: ["deezer"],
    },
    {
      type: "station",
      id: "radio-browser:station:1",
      name: "BBC Radio 1",
      country: "United Kingdom",
      provider: "radio-browser",
      providerId: "station-1",
      sources: ["radio-browser"],
    },
  ],
  partial: false,
  failedProviders: [],
  cached: false,
});

test.describe("search page UI", () => {
  test.beforeEach(async ({ page }) => {
    await mockJsonRoute(page, /\/api\/search\/history/, HistoryResponse, HISTORY_EMPTY);
  });

  // Empty / first-run state — its own test per the rules.
  test("empty state shows the suggestions block", async ({ page }) => {
    await page.goto("/search");
    await expect(page.getByText("Try searching for…")).toBeVisible();
    // Spec calls for 3–4 example queries.
    await expect(page.getByRole("button", { name: "Daft Punk" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Lo-fi beats" })).toBeVisible();
    await expect(page.getByRole("button", { name: "BBC Radio 1" })).toBeVisible();
    await expect(page.getByRole("main")).toHaveScreenshot("search-empty.png", {
      animations: "disabled",
    });
    await expectAccessible(page);
  });

  // Step 2 — tapping a suggestion populates the input AND runs a search.
  test("tapping a suggestion fills the input and runs a search", async ({ page }) => {
    await mockJsonRoute(page, /\/api\/search$/, SearchResponse, TRACK_AND_STATION);

    await page.goto("/search");
    await page.getByRole("button", { name: "Daft Punk" }).click();

    await expect(page.getByRole("textbox")).toHaveValue("Daft Punk");
    await expect(page.getByText("Get Lucky")).toBeVisible();
    await expect(page.getByRole("main")).toHaveScreenshot("search-suggestion-tapped.png", {
      animations: "disabled",
    });
    await expectAccessible(page);
  });

  // Step 3 — loading skeleton on submit.
  test("submitting a query shows a loading skeleton", async ({ page }) => {
    let releaseSearch: (() => void) | null = null;
    const hold = new Promise<void>((resolve) => {
      releaseSearch = resolve;
    });
    // Hold the response so the skeleton has time to render. We can't
    // use mockJsonRoute here (it fulfills synchronously), so we route
    // manually but still validate the body via SearchResponse.parse.
    await page.route(/\/api\/search$/, async (route) => {
      await hold;
      const body = SearchResponse.parse(TRACK_AND_STATION);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    });

    await page.goto("/search");
    await page.getByRole("textbox").fill("daft punk");
    await page.getByRole("textbox").press("Enter");

    await expect(page.getByLabel("Loading results")).toBeVisible();
    await expect(page.getByRole("main")).toHaveScreenshot("search-loading.png", {
      animations: "disabled",
    });
    await expectAccessible(page);

    releaseSearch!();
    await expect(page.getByText("Get Lucky")).toBeVisible();
  });

  // Step 4 — results list rendered, track + station visually distinct.
  test("results render track and station rows, station has the Live indicator", async ({
    page,
  }) => {
    await mockJsonRoute(page, /\/api\/search$/, SearchResponse, TRACK_AND_STATION);

    await page.goto("/search");
    await page.getByRole("textbox").fill("mix");
    await page.getByRole("textbox").press("Enter");

    await expect(page.getByText("Get Lucky")).toBeVisible();
    await expect(page.getByText("BBC Radio 1")).toBeVisible();
    // Station-only "Live" indicator is the visual distinction (UI-06).
    await expect(page.getByLabel("Live")).toHaveCount(1);
    await expect(page.getByRole("main")).toHaveScreenshot("search-results.png", {
      animations: "disabled",
    });
    await expectAccessible(page);
  });

  // Step 6 — clearing the input returns to the suggestions state.
  test("clearing the input returns to the suggestions state", async ({ page }) => {
    await mockJsonRoute(page, /\/api\/search$/, SearchResponse, TRACK_AND_STATION);

    await page.goto("/search");
    await page.getByRole("textbox").fill("queen");
    await page.getByRole("textbox").press("Enter");
    await expect(page.getByText("Get Lucky")).toBeVisible();

    await page.getByRole("button", { name: "Clear input" }).click();
    await expect(page.getByRole("textbox")).toHaveValue("");
    await expect(page.getByText("Try searching for…")).toBeVisible();
    await expect(page.getByRole("main")).toHaveScreenshot(
      "search-cleared-back-to-suggestions.png",
      { animations: "disabled" },
    );
    await expectAccessible(page);
  });

  // Step 7 — empty submit is a no-op.
  test("submitting an empty query does not fire a request", async ({ page }) => {
    let calls = 0;
    await page.route(/\/api\/search$/, async (route) => {
      calls += 1;
      const body = SearchResponse.parse(TRACK_AND_STATION);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    });

    await page.goto("/search");
    await page.getByRole("textbox").press("Enter");

    // Suggestions remain — no skeleton, no results.
    await expect(page.getByText("Try searching for…")).toBeVisible();
    expect(calls).toBe(0);
    await expect(page.getByRole("main")).toHaveScreenshot("search-empty-submit-noop.png", {
      animations: "disabled",
    });
    await expectAccessible(page);
  });

  // Failure mode — backend returned partial+empty (covered against the
  // UI rendering path for completeness, separate from the aggregator
  // contract assertions).
  test("partial+empty response shows the no-results message", async ({ page }) => {
    await mockJsonRoute(page, /\/api\/search$/, SearchResponse, {
      results: [],
      partial: true,
      failedProviders: ["audius", "deezer"],
      cached: false,
    });

    await page.goto("/search");
    await page.getByRole("textbox").fill("zzz");
    await page.getByRole("textbox").press("Enter");

    await expect(page.getByText("No results found. Try a different query.")).toBeVisible();
    await expect(page.getByRole("main")).toHaveScreenshot("search-no-results.png", {
      animations: "disabled",
    });
    await expectAccessible(page);
  });

  // Failure mode — API errors (5xx) → inline retry, retrying refires
  // the request and renders results. Both the error body and the
  // success body are validated against contracts at fulfill time.
  test("API error shows the inline retry; retry succeeds", async ({ page }) => {
    const errorBody = ErrorResponse.parse({
      error: { code: "INTERNAL", message: "boom" },
    });
    const successBody = SearchResponse.parse(TRACK_AND_STATION);

    let attempt = 0;
    await page.route(/\/api\/search$/, async (route) => {
      attempt += 1;
      if (attempt === 1) {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify(errorBody),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(successBody),
        });
      }
    });

    await page.goto("/search");
    await page.getByRole("textbox").fill("queen");
    await page.getByRole("textbox").press("Enter");

    await expect(page.getByText("Couldn't search right now. Try again.")).toBeVisible();
    await expect(page.getByRole("main")).toHaveScreenshot("search-error.png", {
      animations: "disabled",
    });
    await expectAccessible(page);

    await page.getByRole("button", { name: "Retry" }).click();
    await expect(page.getByText("Get Lucky")).toBeVisible();
  });

  // BROWSER-02 — on a 375×667 viewport the input is at the top and the
  // bottom nav stays fixed.
  test("on a 375×667 viewport the input is visible at the top and nav stays fixed", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/search");

    const input = page.getByRole("textbox");
    await expect(input).toBeVisible();
    const inputBox = await input.boundingBox();
    expect(inputBox).not.toBeNull();
    expect(inputBox!.y).toBeGreaterThanOrEqual(0);
    expect(inputBox!.y).toBeLessThan(200);
    await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
    await expect(page).toHaveScreenshot("search-mobile-375x667.png", {
      fullPage: true,
      animations: "disabled",
    });
    await expectAccessible(page);
  });
});
