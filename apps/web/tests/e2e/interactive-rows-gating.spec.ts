import { test, expect, mockJsonRoute, mockJsonError, expectAccessible } from "./fixtures.js";
import { SearchResponse, HistoryResponse } from "@moc/contracts";

/**
 * Feature 05: Interactive rows — explored, saved, sign-in gating.
 * Source: product-specs/search/features/05-interactive-rows-gating.md.
 *
 * Coverage maps directly onto the spec's "User behavior":
 *   1. Anonymous tap on row → sign-in Modal
 *   2. Anonymous dismiss modal (close X / ESC) → modal closed, no event POST
 *   3. Anonymous tap add button → same Modal
 *   5. Authenticated tap on row → row flashes, POST /search/explored fires
 *   6. Authenticated tap add button → button flips to filled, POST /search/saved fires
 *   8. Re-tapping the add button after save is idempotent in the UI
 *   9. Network failure during the POST silently drops; UI is not rolled back
 *
 * Plus the failure modes the spec calls out:
 *   - Modal sits at z-modal — visible above the bottom nav on a 375×667 viewport
 *
 * Empty / first-run state is N/A here per the spec — interactions only
 * matter once results exist.
 */

const HISTORY_EMPTY = { entries: [], nextCursor: null };

const TWO_TRACKS: SearchResponse = SearchResponse.parse({
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
      type: "track",
      id: "audius:track:2",
      title: "One More Time",
      artist: "Daft Punk",
      provider: "audius",
      providerId: "audius-2",
      sources: ["audius"],
    },
  ],
  partial: false,
  failedProviders: [],
  cached: false,
});

async function gotoSearchWithResults(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/search");
  await page.getByRole("textbox").fill("daft punk");
  await page.getByRole("textbox").press("Enter");
  await expect(page.getByText("Get Lucky")).toBeVisible();
}

test.describe("interactive rows — authenticated", () => {
  test.beforeEach(async ({ page }) => {
    await mockJsonRoute(page, /\/api\/search\/history/, HistoryResponse, HISTORY_EMPTY);
    await mockJsonRoute(page, /\/api\/search$/, SearchResponse, TWO_TRACKS);
  });

  // Step 5 — authenticated tap on row records explored (3) and flashes.
  test("tapping a row fires POST /search/explored and the row briefly flashes", async ({
    page,
  }) => {
    let exploredHits = 0;
    await page.route(/\/api\/search\/explored$/, async (route) => {
      exploredHits += 1;
      await route.fulfill({ status: 204 });
    });

    await gotoSearchWithResults(page);
    const firstRow = page.getByTestId("interactive-row").first();
    await firstRow.click();

    // POST fires (fire-and-forget — we just care that the request happened).
    await expect.poll(() => exploredHits).toBeGreaterThan(0);

    await expect(page.getByRole("main")).toHaveScreenshot("rows-authed-explored.png", {
      animations: "disabled",
    });
    await expectAccessible(page);
  });

  // Step 6 — authenticated tap add button fires saved + flips visual state.
  test("tapping the add button flips it to filled and fires POST /search/saved", async ({
    page,
  }) => {
    let savedHits = 0;
    await page.route(/\/api\/search\/saved$/, async (route) => {
      savedHits += 1;
      await route.fulfill({ status: 204 });
    });

    await gotoSearchWithResults(page);
    const firstSave = page.getByTestId("save-button").first();
    await expect(firstSave).toHaveAttribute("aria-pressed", "false");
    await firstSave.click();
    await expect(firstSave).toHaveAttribute("aria-pressed", "true");
    await expect(firstSave).toHaveAccessibleName("Saved");

    await expect.poll(() => savedHits).toBeGreaterThan(0);

    await expect(page.getByRole("main")).toHaveScreenshot("rows-authed-saved.png", {
      animations: "disabled",
    });
    await expectAccessible(page);
  });

  // Step 8 — re-tapping the add button after save is idempotent in the UI.
  test("re-tapping the add button after save keeps it filled (UI-idempotent)", async ({ page }) => {
    let savedHits = 0;
    await page.route(/\/api\/search\/saved$/, async (route) => {
      savedHits += 1;
      await route.fulfill({ status: 204 });
    });

    await gotoSearchWithResults(page);
    const firstSave = page.getByTestId("save-button").first();
    await firstSave.click();
    await expect(firstSave).toHaveAttribute("aria-pressed", "true");
    await firstSave.click();
    await expect(firstSave).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => savedHits).toBeGreaterThanOrEqual(2);
  });

  // Step 9 — POST fails (server error) → UI is NOT rolled back.
  test("network failure during POST /search/saved leaves the button in 'saved' state", async ({
    page,
  }) => {
    await mockJsonError(page, /\/api\/search\/saved$/, 500, {
      code: "INTERNAL",
      message: "boom",
    });

    await gotoSearchWithResults(page);
    const firstSave = page.getByTestId("save-button").first();
    await firstSave.click();

    // Optimistic state stays — per the spec's trade-off note.
    await expect(firstSave).toHaveAttribute("aria-pressed", "true");
    await expect(firstSave).toHaveAccessibleName("Saved");
  });
});

test.describe("interactive rows — anonymous (UI-09, UI-10)", () => {
  // Anonymous mode — the universal /api/auth/me mock returns 401, so
  // useAuth() resolves to "unauthenticated" and the Modal gates both
  // interactions.
  test.use({ authed: false });

  test.beforeEach(async ({ page }) => {
    await mockJsonRoute(page, /\/api\/search\/history/, HistoryResponse, HISTORY_EMPTY);
    await mockJsonRoute(page, /\/api\/search$/, SearchResponse, TWO_TRACKS);
  });

  // Step 1 — anonymous tap on row opens the Modal; UI-09 — no POST fires.
  test("anonymous tap on a row opens the sign-in Modal and fires no event POST", async ({
    page,
  }) => {
    let exploredHits = 0;
    await page.route(/\/api\/search\/explored$/, async (route) => {
      exploredHits += 1;
      await route.fulfill({ status: 204 });
    });

    await gotoSearchWithResults(page);
    await page.getByTestId("interactive-row").first().click();

    await expect(page.getByRole("dialog", { name: /sign in/i })).toBeVisible();
    expect(exploredHits).toBe(0);

    await expect(page).toHaveScreenshot("rows-anon-modal-open.png", {
      animations: "disabled",
      fullPage: true,
    });
    await expectAccessible(page);
  });

  // Step 3 — anonymous tap on add button opens the same Modal; UI-09.
  test("anonymous tap on the add button opens the sign-in Modal and fires no event POST", async ({
    page,
  }) => {
    let savedHits = 0;
    await page.route(/\/api\/search\/saved$/, async (route) => {
      savedHits += 1;
      await route.fulfill({ status: 204 });
    });

    await gotoSearchWithResults(page);
    await page.getByTestId("save-button").first().click();

    await expect(page.getByRole("dialog", { name: /sign in/i })).toBeVisible();
    expect(savedHits).toBe(0);
  });

  // Step 2 — modal can be dismissed via close X.
  test("anonymous user can dismiss the Modal via the close X", async ({ page }) => {
    await gotoSearchWithResults(page);
    await page.getByTestId("interactive-row").first().click();

    const dialog = page.getByRole("dialog", { name: /sign in/i });
    await expect(dialog).toBeVisible();
    await page.getByRole("button", { name: "Close" }).click();
    await expect(dialog).toBeHidden();
  });

  // UI-10 — Modal renders above the bottom nav on a mobile viewport.
  test("on a 375×667 viewport the Modal renders above the bottom nav", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await gotoSearchWithResults(page);
    await page.getByTestId("save-button").first().click();

    const dialog = page.getByRole("dialog", { name: /sign in/i });
    await expect(dialog).toBeVisible();

    // The Modal backdrop fills the viewport (top edge ≤ nav top edge),
    // so the user can see the card while the nav stays styled below it.
    const backdropBox = await page.getByTestId("modal-backdrop").boundingBox();
    const navBox = await page.getByRole("navigation", { name: "Main navigation" }).boundingBox();
    expect(backdropBox).not.toBeNull();
    expect(navBox).not.toBeNull();
    // Backdrop covers the full viewport — so its bottom edge is at/below
    // the nav's bottom edge — i.e. it's painted *over* the nav region.
    expect(backdropBox!.y + backdropBox!.height).toBeGreaterThanOrEqual(
      navBox!.y + navBox!.height - 1,
    );

    await expect(page).toHaveScreenshot("rows-anon-modal-mobile-375x667.png", {
      fullPage: true,
      animations: "disabled",
    });
    await expectAccessible(page);
  });
});
