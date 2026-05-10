import { test, expect, mockJsonRoute, expectAccessible } from "./fixtures.js";
import { SearchResponse, HistoryResponse } from "@moc/contracts";

/**
 * Feature 02 (explore): SoundCloud search backend.
 * Source: product-specs/explore/features/02-soundcloud-search-backend.md.
 *
 * The backend-only addition of SoundCloud has one user-visible
 * consequence: search results can now include SoundCloud hits identified
 * by a "SoundCloud" source badge. These tests pin the contract → render
 * path for that scenario and the key failure modes.
 */

const HISTORY_EMPTY: HistoryResponse = HistoryResponse.parse({
  entries: [],
  nextCursor: null,
});

const SOUNDCLOUD_RESULT: SearchResponse = SearchResponse.parse({
  results: [
    {
      type: "track",
      id: "soundcloud:track:123456",
      title: "Levitating",
      artist: "Dua Lipa",
      duration: 203,
      provider: "soundcloud",
      providerId: "sc-123456",
      sources: ["soundcloud"],
    },
    {
      type: "track",
      id: "deezer:track:99",
      title: "Levitating",
      artist: "Dua Lipa",
      duration: 203,
      provider: "deezer",
      providerId: "deezer-99",
      sources: ["deezer"],
    },
  ],
  partial: false,
  failedProviders: [],
  cached: false,
});

const SOUNDCLOUD_FAILED_PARTIAL: SearchResponse = SearchResponse.parse({
  results: [
    {
      type: "track",
      id: "deezer:track:99",
      title: "Levitating",
      artist: "Dua Lipa",
      duration: 203,
      provider: "deezer",
      providerId: "deezer-99",
      sources: ["deezer"],
    },
  ],
  partial: true,
  failedProviders: ["soundcloud"],
  cached: false,
});

const EMPTY_NO_SOUNDCLOUD_FAILED: SearchResponse = SearchResponse.parse({
  results: [],
  partial: false,
  failedProviders: [],
  cached: false,
});

test.describe("soundcloud search backend", () => {
  test.beforeEach(async ({ page }) => {
    await mockJsonRoute(page, /\/api\/search\/history/, HistoryResponse, HISTORY_EMPTY);
  });

  // User behavior: search results include SoundCloud hits with "SoundCloud" badge.
  test("SoundCloud track result renders with SoundCloud source badge", async ({ page }) => {
    await mockJsonRoute(page, /\/api\/search$/, SearchResponse, SOUNDCLOUD_RESULT);

    await page.goto("/search");
    await page.getByRole("textbox").fill("levitating dua lipa");
    await page.getByRole("textbox").press("Enter");

    await expect(page.getByText("Levitating").first()).toBeVisible();
    // The providerLabel map maps "soundcloud" → "SoundCloud"; assert badge text.
    await expect(page.getByText("SoundCloud")).toBeVisible();
    await expect(page.getByRole("main")).toHaveScreenshot("sc-badge-visible.png", {
      animations: "disabled",
    });
    await expectAccessible(page);
  });

  // Failure mode: SC times out → partial: true, failedProviders: ["soundcloud"];
  // other providers' results still appear (the "Unavailable" hint only
  // renders in the empty-state branch — when other results exist, the UI
  // shows them silently without a partial indicator).
  test("SoundCloud timeout yields partial results with other providers intact", async ({
    page,
  }) => {
    await mockJsonRoute(page, /\/api\/search$/, SearchResponse, SOUNDCLOUD_FAILED_PARTIAL);

    await page.goto("/search");
    await page.getByRole("textbox").fill("levitating dua lipa");
    await page.getByRole("textbox").press("Enter");

    // Other providers' results are still rendered.
    await expect(page.getByText("Levitating")).toBeVisible();
    // No "SoundCloud" badge — only the Deezer result (Deezer badge shown).
    await expect(page.getByText("SoundCloud")).toHaveCount(0);
    await expect(page.getByText("Deezer")).toBeVisible();
    await expect(page.getByRole("main")).toHaveScreenshot("sc-failed-partial.png", {
      animations: "disabled",
    });
    await expectAccessible(page);
  });

  // User behavior: obscure query → SoundCloud returns no results;
  // it is NOT listed in failedProviders (no results ≠ error).
  test("zero SC results for obscure query does not add soundcloud to failedProviders", async ({
    page,
  }) => {
    await mockJsonRoute(page, /\/api\/search$/, SearchResponse, EMPTY_NO_SOUNDCLOUD_FAILED);

    await page.goto("/search");
    await page.getByRole("textbox").fill("asdkjhasdkjh");
    await page.getByRole("textbox").press("Enter");

    await expect(page.getByText("No results found. Try a different query.")).toBeVisible();
    // "Unavailable:" block must NOT appear — SC succeeded with 0 results.
    await expect(page.getByText(/Unavailable:/)).toHaveCount(0);
    await expect(page.getByRole("main")).toHaveScreenshot("sc-empty-no-failed.png", {
      animations: "disabled",
    });
    await expectAccessible(page);
  });
});
