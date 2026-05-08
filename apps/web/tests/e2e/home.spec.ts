import { test, expect, expectAccessible } from "./fixtures.js";

/**
 * Home page snapshots.
 *
 * The fixture defaults to authenticated, so the bare `test()` here
 * captures the post-sign-in main view. The nested `not signed in`
 * describe opts out via `test.use({ authed: false })` to capture the
 * SignInPage that's rendered when /api/auth/me returns 401.
 *
 * Per AGENTS.md hard rule #12: failing snapshot defaults to "code is
 * wrong"; only regenerate baselines when the diff is the intended
 * change.
 *
 * Per AGENTS.md hard rule #13: every snapshot pairs with
 * expectAccessible(page) — visual proves what the page LOOKS like,
 * axe proves it's READABLE.
 */

test.describe("home page", () => {
  test("authenticated — main app view", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveScreenshot("home-authenticated.png", {
      fullPage: true,
    });
    await expectAccessible(page);
  });

  test.describe("not signed in", () => {
    test.use({ authed: false });

    test("shows sign-in page", async ({ page }) => {
      await page.goto("/");
      await expect(page).toHaveScreenshot("home-unauthenticated.png", {
        fullPage: true,
      });
      await expectAccessible(page);
    });
  });
});
