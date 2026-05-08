import { test, expect } from "./fixtures.js";

/**
 * Home page snapshots.
 *
 * The fixture defaults to authenticated, so the bare `test()` here
 * captures the post-sign-in main view. The nested `not signed in`
 * describe opts out via `test.use({ authed: false })` to capture the
 * SignInPage that's rendered when /api/me returns 401.
 *
 * Per AGENTS.md hard rule #12: failing snapshot defaults to "code is
 * wrong"; only regenerate baselines when the diff is the intended
 * change.
 */

test.describe("home page", () => {
  test("authenticated — main app view", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveScreenshot("home-authenticated.png", {
      fullPage: true,
    });
  });

  test.describe("not signed in", () => {
    test.use({ authed: false });

    test("shows sign-in page", async ({ page }) => {
      await page.goto("/");
      await expect(page).toHaveScreenshot("home-unauthenticated.png", {
        fullPage: true,
      });
    });
  });
});
