import { test, expect, mockJsonRoute } from "./fixtures.js";
import { HistoryResponse } from "@moc/contracts";

/**
 * Feature 01: App shell — router + bottom navigation.
 * Source: pending-epics/search/features/01-app-shell-bottom-nav.md.
 *
 * Each screenshot tracks one numbered step in the spec's User behavior
 * section, plus its named failure modes and viewport requirements.
 *
 * History calls fire on every Search-page mount; mocked empty so the
 * page state stays deterministic on /search visits.
 */

const HISTORY_EMPTY = { entries: [], nextCursor: null };

test.describe("app shell — bottom nav", () => {
  test.beforeEach(async ({ page }) => {
    await mockJsonRoute(page, /\/api\/search\/history/, HistoryResponse, HISTORY_EMPTY);
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
  });

  // Step 2 — taps Explore → "Explore — coming soon" + Explore active.
  test("tapping Explore activates the Explore tab", async ({ page }) => {
    await page.goto("/search");
    await page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("link", { name: "Explore" })
      .click();
    await expect(page.getByText("Explore — coming soon")).toBeVisible();
    await expect(
      page
        .getByRole("navigation", { name: "Main navigation" })
        .getByRole("link", { name: "Explore" }),
    ).toHaveAttribute("aria-current", "page");
    await expect(page).toHaveScreenshot("shell-explore.png", {
      fullPage: true,
      animations: "disabled",
    });
  });

  // Step 3 — taps Taste → "Taste — coming soon" + Taste active.
  test("tapping Taste activates the Taste tab", async ({ page }) => {
    await page.goto("/explore");
    await page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("link", { name: "Taste" })
      .click();
    await expect(page.getByText("Taste — coming soon")).toBeVisible();
    await expect(
      page
        .getByRole("navigation", { name: "Main navigation" })
        .getByRole("link", { name: "Taste" }),
    ).toHaveAttribute("aria-current", "page");
    await expect(page).toHaveScreenshot("shell-taste.png", {
      fullPage: true,
      animations: "disabled",
    });
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
  });

  // Step 5 — refresh preserves the active tab (PWA-01).
  test("refresh preserves the active tab", async ({ page }) => {
    await page.goto("/explore");
    await page.reload();
    await expect(page.getByText("Explore — coming soon")).toBeVisible();
    await expect(
      page
        .getByRole("navigation", { name: "Main navigation" })
        .getByRole("link", { name: "Explore" }),
    ).toHaveAttribute("aria-current", "page");
    await expect(page).toHaveScreenshot("shell-refresh-preserves-tab.png", {
      fullPage: true,
      animations: "disabled",
    });
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
  });
});
