import { test, expect, mockJsonRoute, expectAccessible } from "./fixtures.js";
import { HistoryResponse, TasteBucketsResponse } from "@moc/contracts";

/**
 * Feature 01: App shell — router + bottom navigation.
 * Source: product-specs/search/features/01-app-shell-bottom-nav.md.
 *
 * Each screenshot tracks one numbered step in the spec's User behavior
 * section, plus its named failure modes and viewport requirements.
 *
 * History calls fire on every Search-page mount; mocked empty so the
 * page state stays deterministic on /search visits. Taste profile is
 * mocked empty too — the page itself is owned by feature taste/07,
 * but the shell tests still need to land on /taste and want a
 * deterministic state to screenshot.
 */

const HISTORY_EMPTY = { entries: [], nextCursor: null };
const TASTE_EMPTY = { buckets: [] };

test.describe("app shell — bottom nav", () => {
  test.beforeEach(async ({ page }) => {
    await mockJsonRoute(page, /\/api\/search\/history/, HistoryResponse, HISTORY_EMPTY);
    await mockJsonRoute(page, /\/api\/me\/taste\/profile/, TasteBucketsResponse, TASTE_EMPTY);
  });

  // Step 1 — anonymous (or authed) user opens / and lands on Search.
  test("/ lands on /search with Search tab active", async ({ page }) => {
    await page.goto("/");
    await expect(
      page
        .getByRole("navigation", { name: "Main navigation" })
        .getByRole("link", { name: "Search" }),
    ).toHaveAttribute("aria-current", "page");
    await expect(page).toHaveScreenshot("shell-default-search.png", {
      fullPage: true,
      animations: "disabled",
    });
    await expectAccessible(page);
  });

  // Step 2 — taps Explore → Explore page renders + Explore active.
  test("tapping Explore activates the Explore tab", async ({ page }) => {
    await page.goto("/search");
    await page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("link", { name: "Explore" })
      .click();
    await expect(page.getByTestId("explore-page")).toBeVisible();
    await expect(
      page
        .getByRole("navigation", { name: "Main navigation" })
        .getByRole("link", { name: "Explore" }),
    ).toHaveAttribute("aria-current", "page");
    await expect(page).toHaveScreenshot("shell-explore.png", {
      fullPage: true,
      animations: "disabled",
    });
    await expectAccessible(page);
  });

  // Step 3 — taps Taste → empty-state Taste content (taste/07 owns the
  // surface; here we just confirm the route lands and the tab becomes
  // active).
  test("tapping Taste activates the Taste tab", async ({ page }) => {
    await page.goto("/explore");
    await page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("link", { name: "Taste" })
      .click();
    await expect(page.getByRole("heading", { name: "Build your Taste" })).toBeVisible();
    await expect(
      page
        .getByRole("navigation", { name: "Main navigation" })
        .getByRole("link", { name: "Taste" }),
    ).toHaveAttribute("aria-current", "page");
    await expect(page).toHaveScreenshot("shell-taste.png", {
      fullPage: true,
      animations: "disabled",
    });
    await expectAccessible(page);
  });

  // Step 4 — back to Search.
  test("tapping Search returns to the Search tab", async ({ page }) => {
    await page.goto("/taste");
    await page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("link", { name: "Search" })
      .click();
    await expect(
      page
        .getByRole("navigation", { name: "Main navigation" })
        .getByRole("link", { name: "Search" }),
    ).toHaveAttribute("aria-current", "page");
    await expect(page).toHaveScreenshot("shell-back-to-search.png", {
      fullPage: true,
      animations: "disabled",
    });
    await expectAccessible(page);
  });

  // Step 5 — refresh preserves the active tab (PWA-01).
  test("refresh preserves the active tab", async ({ page }) => {
    await page.goto("/explore");
    await page.reload();
    await expect(page.getByTestId("explore-page")).toBeVisible();
    await expect(
      page
        .getByRole("navigation", { name: "Main navigation" })
        .getByRole("link", { name: "Explore" }),
    ).toHaveAttribute("aria-current", "page");
    await expect(page).toHaveScreenshot("shell-refresh-preserves-tab.png", {
      fullPage: true,
      animations: "disabled",
    });
    await expectAccessible(page);
  });

  // Failure mode — direct navigation to an unknown route falls back to /search.
  test("unknown route falls back to /search", async ({ page }) => {
    await page.goto("/this-route-does-not-exist");
    await expect(page).toHaveURL(/\/search$/);
    await expect(
      page
        .getByRole("navigation", { name: "Main navigation" })
        .getByRole("link", { name: "Search" }),
    ).toHaveAttribute("aria-current", "page");
    await expect(page).toHaveScreenshot("shell-unknown-route-fallback.png", {
      fullPage: true,
      animations: "disabled",
    });
    await expectAccessible(page);
  });

  // Anonymous user sees identical shell (UI-02 covers this acceptance criterion).
  test.describe("not signed in", () => {
    test.use({ authed: false });

    test("anonymous user sees identical shell on /search", async ({ page }) => {
      await page.goto("/search");
      await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
      await expect(page).toHaveScreenshot("shell-anonymous-search.png", {
        fullPage: true,
        animations: "disabled",
      });
      await expectAccessible(page);
    });
  });

  // BROWSER-01 — 375×667 mobile viewport, tap targets ≥ 44×44.
  test("on a 375×667 viewport, tap targets are at least 44×44 px", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/search");

    const links = page.getByRole("navigation", { name: "Main navigation" }).getByRole("link");
    expect(await links.count()).toBe(3);
    for (let i = 0; i < 3; i++) {
      const box = await links.nth(i).boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
    await expect(page).toHaveScreenshot("shell-mobile-375x667.png", {
      fullPage: true,
      animations: "disabled",
    });
    await expectAccessible(page);
  });
});
