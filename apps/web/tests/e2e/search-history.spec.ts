import { test, expect, mockJsonRoute, expectAccessible } from "./fixtures.js";
import { SearchResponse, HistoryResponse } from "@moc/contracts";

/**
 * Feature 04: Search history (per-user, infinite scroll, deduped).
 * Source: pending-epics/search/features/04-search-history.md.
 *
 * One screenshot per visible state change in the spec's User behavior:
 *  - 2. Authenticated user with zero entries → still suggestions
 *  - 5. Authenticated user with ≥ 1 entry → history list replaces
 *       suggestions (UI-07)
 *  - 7. Tapping a history item replays the search
 *  - Clearing the input after a search returns to history (not
 *    suggestions)
 *  - 8. Cursor pagination — second page appears
 *  - 1. Anonymous user → only static suggestions, no history fetch
 */

const HISTORY_TWO: HistoryResponse = HistoryResponse.parse({
  entries: [
    {
      id: "h1",
      query: "daft punk",
      lastSearchedAt: new Date(Date.now() - 30_000).toISOString(),
      searchCount: 1,
    },
    {
      id: "h2",
      query: "queen",
      lastSearchedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
      searchCount: 1,
    },
  ],
  nextCursor: null,
});

const TRACK_RESPONSE: SearchResponse = SearchResponse.parse({
  results: [
    {
      type: "track",
      id: "audius:track:1",
      title: "Around the World",
      artist: "Daft Punk",
      duration: 429,
      provider: "audius",
      providerId: "audius-1",
      sources: ["audius"],
    },
  ],
  partial: false,
  failedProviders: [],
  cached: false,
});

test.describe("search history", () => {
  // Step 2 — auth user with zero entries: suggestions remain.
  test("zero entries: suggestions remain (history list not shown)", async ({ page }) => {
    await mockJsonRoute(page, /\/api\/search\/history/, HistoryResponse, {
      entries: [],
      nextCursor: null,
    });

    await page.goto("/search");
    await expect(page.getByText("Try searching for…")).toBeVisible();
    await expect(page.getByRole("main")).toHaveScreenshot("history-empty-suggestions-shown.png", {
      animations: "disabled",
    });
    await expectAccessible(page);
  });

  // Step 5 (UI-07) — auth user with entries: list replaces suggestions.
  test("with entries: history list replaces suggestions (UI-07)", async ({ page }) => {
    await mockJsonRoute(page, /\/api\/search\/history/, HistoryResponse, HISTORY_TWO);

    await page.goto("/search");
    await expect(page.getByRole("button", { name: /daft punk/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /queen/ })).toBeVisible();
    await expect(page.getByText("Try searching for…")).toHaveCount(0);
    await expect(page.getByRole("main")).toHaveScreenshot("history-list-replaces-suggestions.png", {
      animations: "disabled",
    });
    await expectAccessible(page);
  });

  // Step 7 — tapping a history entry repopulates the input + runs search.
  test("tapping a history entry repopulates the input and runs the search", async ({ page }) => {
    await mockJsonRoute(page, /\/api\/search\/history/, HistoryResponse, HISTORY_TWO);
    await mockJsonRoute(page, /\/api\/search$/, SearchResponse, TRACK_RESPONSE);

    await page.goto("/search");
    await expect(page.getByRole("button", { name: /daft punk/ })).toBeVisible();

    await page.getByRole("button", { name: /daft punk/ }).click();

    await expect(page.getByRole("textbox")).toHaveValue("daft punk");
    await expect(page.getByText("Around the World")).toBeVisible();
    await expect(page.getByRole("main")).toHaveScreenshot("history-entry-replayed.png", {
      animations: "disabled",
    });
    await expectAccessible(page);
  });

  // Clearing the input after a search returns to history (not suggestions).
  test("clearing the input after a search returns to the history list", async ({ page }) => {
    await mockJsonRoute(page, /\/api\/search\/history/, HistoryResponse, HISTORY_TWO);
    await mockJsonRoute(page, /\/api\/search$/, SearchResponse, TRACK_RESPONSE);

    await page.goto("/search");
    await page.getByRole("textbox").fill("queen");
    await page.getByRole("textbox").press("Enter");
    await expect(page.getByText("Around the World")).toBeVisible();

    await page.getByRole("button", { name: "Clear input" }).click();

    await expect(page.getByRole("button", { name: /daft punk/ })).toBeVisible();
    await expect(page.getByText("Try searching for…")).toHaveCount(0);
    await expect(page.getByRole("main")).toHaveScreenshot("history-cleared-back-to-history.png", {
      animations: "disabled",
    });
    await expectAccessible(page);
  });

  // Step 8 — cursor pagination: scrolling triggers next-page fetch.
  test("cursor pagination loads a second page when the sentinel is in view", async ({ page }) => {
    const pageOne = HistoryResponse.parse({
      entries: [
        {
          id: "p1",
          query: "first",
          lastSearchedAt: new Date(Date.now() - 60_000).toISOString(),
          searchCount: 1,
        },
      ],
      nextCursor: "cursor-page-2",
    });
    const pageTwo = HistoryResponse.parse({
      entries: [
        {
          id: "p2",
          query: "second",
          lastSearchedAt: new Date(Date.now() - 120_000).toISOString(),
          searchCount: 1,
        },
      ],
      nextCursor: null,
    });

    // Idempotent route handler: same cursor → same response. This is
    // safe under React StrictMode's double useEffect (fetchFirst fires
    // twice) — both first-page fetches get pageOne.
    let secondPageCursor: string | null = null;
    await page.route(/\/api\/search\/history/, async (route, request) => {
      const url = new URL(request.url());
      const cursor = url.searchParams.get("cursor");
      if (cursor === null) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(pageOne),
        });
      } else {
        secondPageCursor = cursor;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(pageTwo),
        });
      }
    });

    await page.goto("/search");
    await expect(page.getByRole("button", { name: /first/ })).toBeVisible();

    // The IntersectionObserver fires loadMore once the sentinel is in
    // viewport; useHistory's effect-driven fetch handles the rest.
    await expect(page.getByRole("button", { name: /second/ })).toBeVisible();
    expect(secondPageCursor).toBe("cursor-page-2");
    await expect(page.getByRole("main")).toHaveScreenshot("history-paginated-two-pages.png", {
      animations: "disabled",
    });
    await expectAccessible(page);
  });

  // Step 1 — anonymous user sees only suggestions, never fires
  // GET /search/history.
  test.describe("not signed in", () => {
    test.use({ authed: false });

    test("anonymous user sees suggestions and does not fetch /search/history", async ({ page }) => {
      let historyCalls = 0;
      await page.route(/\/api\/search\/history/, async (route) => {
        historyCalls += 1;
        await route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({
            error: { code: "UNAUTHENTICATED", message: "Not signed in" },
          }),
        });
      });

      await page.goto("/search");
      await expect(page.getByText("Try searching for…")).toBeVisible();
      // Wait on observable state — by the time suggestions are visible
      // and useAuth has resolved, the history hook has decided whether
      // to fire. The hook short-circuits when not authenticated.
      await expect(page.getByRole("button", { name: "Daft Punk" })).toBeVisible();
      expect(historyCalls).toBe(0);
      await expect(page.getByRole("main")).toHaveScreenshot("history-anonymous-suggestions.png", {
        animations: "disabled",
      });
      await expectAccessible(page);
    });
  });
});
