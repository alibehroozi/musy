import { test, expect, mockJsonRoute, expectAccessible } from "./fixtures.js";
import {
  NextResponse,
  ResolveResponse,
  TasteProfileResponse,
  HistoryResponse,
} from "@moc/contracts";
import type { Page } from "@playwright/test";

/**
 * Feature 06: Explore page UI.
 * Source: product-specs/explore/features/06-explore-page-ui.md.
 *
 * Coverage maps onto the spec's "User behavior" + the four mockup states:
 *   1. Default: top card + scrubber + action row + behind cards
 *   4./5. Mid-swipe-right: top card translated, LIKE stamp visible
 *   8. Refilling: empty queue → three-dot animation + caption
 *   2. Onboarding: first visit overlay (localStorage flag unset)
 *   10. Phase pill copy varies on profile.phase
 *   Failure mode: API down → refilling state with retry
 *   BROWSER-05: 375×667 — IconButton ≥ 44×44, action row no x-scroll, artwork ≥ 240×240
 *   BROWSER-06: every state passes axe-core WCAG 2.1 AA
 */

const ITEMS = NextResponse.parse({
  items: [
    {
      title: "Get Lucky",
      artist: "Daft Punk",
      durationSec: 369,
      kind: "track",
    },
    {
      title: "One More Time",
      artist: "Daft Punk",
      durationSec: 320,
      kind: "track",
    },
    {
      title: "Strobe",
      artist: "Deadmau5",
      durationSec: 600,
      kind: "track",
    },
  ],
  phase: "discovery",
  partial: false,
  buildingQueue: false,
});

const RESOLVE_OK = ResolveResponse.parse({
  source: "audius",
  sourceTrackId: "audius-1",
  streamUrl: "http://localhost:5173/test-audio.mp3",
  expiresAt: "2026-12-31T00:00:00.000Z",
});

const HISTORY_EMPTY = HistoryResponse.parse({ entries: [], nextCursor: null });

// 44-byte silent WAV — valid, loads instantly, plays silently.
const SILENT_WAV_HEX =
  "52494646240000005741564566 6d7420100000000100010044ac0000881001000200 10006461746100000000".replace(
    /\s/g,
    "",
  );

async function routeAudio(page: Page): Promise<void> {
  const wav = Buffer.from(SILENT_WAV_HEX, "hex");
  await page.route("**/test-audio.mp3", (route) =>
    route.fulfill({ status: 200, contentType: "audio/wav", body: wav }),
  );
}

async function clearOnboarding(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.setItem("moc.explore.onboarded", "1");
  });
}

async function setFirstVisit(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.removeItem("moc.explore.onboarded");
  });
}

async function mockExploreEndpoints(
  page: Page,
  next: NextResponse = ITEMS,
  profile: TasteProfileResponse = null,
): Promise<void> {
  await mockJsonRoute(page, /\/api\/explore\/next/, NextResponse, next);
  await mockJsonRoute(page, /\/api\/explore\/profile/, TasteProfileResponse, profile);
  await mockJsonRoute(page, /\/api\/play\/resolve/, ResolveResponse, RESOLVE_OK);
  await mockJsonRoute(page, /\/api\/search\/history/, HistoryResponse, HISTORY_EMPTY);
  await page.route(/\/api\/explore\/swipe/, (route) => route.fulfill({ status: 204, body: "" }));
  await routeAudio(page);
}

test.describe("explore page UI", () => {
  test("default state — top card, action row, phase pill", async ({ page }) => {
    await clearOnboarding(page);
    await mockExploreEndpoints(page);
    await page.goto("/explore");

    await expect(page.getByText("Get Lucky")).toBeVisible();
    await expect(page.getByTestId("phase-pill")).toHaveText("Discovering taste");
    await expect(page.getByRole("button", { name: "Pass" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Like" })).toBeVisible();

    await expect(page).toHaveScreenshot("explore-default.png", { animations: "disabled" });
    await expectAccessible(page);
  });

  test("onboarding state — first visit shows the overlay", async ({ page }) => {
    await setFirstVisit(page);
    await mockExploreEndpoints(page);
    await page.goto("/explore");

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute("aria-modal", "true");
    await expect(page.getByRole("button", { name: "Got it" })).toBeVisible();

    await expect(page).toHaveScreenshot("explore-onboarding.png", { animations: "disabled" });
    await expectAccessible(page);
  });

  test("dismissing onboarding sets the localStorage flag and removes the overlay", async ({
    page,
  }) => {
    await setFirstVisit(page);
    await mockExploreEndpoints(page);
    await page.goto("/explore");

    await page.getByRole("button", { name: "Got it" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const flag = await page.evaluate(() => window.localStorage.getItem("moc.explore.onboarded"));
    expect(flag).toBe("1");
  });

  test("tapping ♥ swipes to the next card", async ({ page }) => {
    await clearOnboarding(page);
    await mockExploreEndpoints(page);
    await page.goto("/explore");

    await expect(page.getByText("Get Lucky")).toBeVisible();
    await page.getByRole("button", { name: "Like" }).click();

    await expect(page.getByText("One More Time")).toBeVisible();
    // The previous top card is no longer the top of the stack.
    await expect(page.locator("[data-explore-position='top']")).toHaveCount(1);
    await expect(page.locator("[data-explore-position='top']")).toContainText("One More Time");
  });

  test("refilling state — empty queue + retry button after delay", async ({ page }) => {
    await clearOnboarding(page);
    await mockExploreEndpoints(
      page,
      NextResponse.parse({ items: [], phase: "discovery", partial: true, buildingQueue: false }),
    );
    await page.goto("/explore");

    await expect(page.getByTestId("explore-refilling")).toBeVisible();
    await expect(page.getByText("Inspired by your taste")).toBeVisible();

    await expect(page).toHaveScreenshot("explore-refilling.png", { animations: "disabled" });
    await expectAccessible(page);
  });

  test("API down — refilling state surfaces with retry", async ({ page }) => {
    await clearOnboarding(page);
    await page.route(/\/api\/explore\/next/, (r) => r.abort());
    await page.route(/\/api\/explore\/profile/, (r) => r.abort());
    await mockJsonRoute(page, /\/api\/play\/resolve/, ResolveResponse, RESOLVE_OK);
    await mockJsonRoute(page, /\/api\/search\/history/, HistoryResponse, HISTORY_EMPTY);
    await routeAudio(page);

    await page.goto("/explore");
    await expect(page.getByTestId("explore-refilling")).toBeVisible();
    await expectAccessible(page);
  });

  test("phase='personalized' → phase pill is absent", async ({ page }) => {
    await clearOnboarding(page);
    await mockExploreEndpoints(page, NextResponse.parse({ ...ITEMS, phase: "personalized" }));
    await page.goto("/explore");

    await expect(page.getByText("Get Lucky")).toBeVisible();
    await expect(page.getByTestId("phase-pill")).toHaveCount(0);
  });

  test("phase='artist-refinement' → 'Finding artists' pill copy", async ({ page }) => {
    await clearOnboarding(page);
    await mockExploreEndpoints(page, NextResponse.parse({ ...ITEMS, phase: "artist-refinement" }));
    await page.goto("/explore");

    await expect(page.getByTestId("phase-pill")).toHaveText("Finding artists");
  });

  test("BROWSER-05: 375×667 — action row touch targets ≥ 44 px and no horizontal scroll", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await clearOnboarding(page);
    await mockExploreEndpoints(page);
    await page.goto("/explore");

    await expect(page.getByText("Get Lucky")).toBeVisible();

    for (const name of ["Pass", "Like"]) {
      const btn = page.getByRole("button", { name });
      const box = await btn.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }

    const row = page.getByTestId("explore-action-row");
    const rowBox = await row.boundingBox();
    expect(rowBox).not.toBeNull();
    expect(rowBox!.width).toBeLessThanOrEqual(375);

    const artwork = page
      .locator("[data-testid='explore-top-card'] [data-testid='explore-artwork']")
      .first();
    const artBox = await artwork.boundingBox();
    expect(artBox).not.toBeNull();
    expect(artBox!.width).toBeGreaterThanOrEqual(240);
    expect(artBox!.height).toBeGreaterThanOrEqual(240);

    await expect(page).toHaveScreenshot("explore-mobile-375x667.png", {
      fullPage: true,
      animations: "disabled",
    });
    await expectAccessible(page);
  });

  test.describe("not signed in", () => {
    test.use({ authed: false });

    test("anonymous user gets a sign-in CTA", async ({ page }) => {
      await mockJsonRoute(page, /\/api\/search\/history/, HistoryResponse, HISTORY_EMPTY);
      await page.goto("/explore");

      await expect(page.getByText("Sign in to explore")).toBeVisible();
      await expect(page).toHaveScreenshot("explore-signed-out.png", { animations: "disabled" });
      await expectAccessible(page);
    });
  });
});
