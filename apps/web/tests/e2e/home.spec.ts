import { test, expect } from "@playwright/test";

// First Layer 2 page snapshot. Captures the home route in its
// unauthenticated state (which is currently SignInPage). When new
// routes land, add a sibling spec file per route.
//
// Failing this test means EITHER the home page changed visually
// (regenerate baselines if intentional) OR a regression slipped in.
// Per AGENTS.md hard rule #12: default conclusion is the code is wrong.
test("home page (unauthenticated)", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveScreenshot("home-unauthenticated.png", {
    fullPage: true,
  });
});
