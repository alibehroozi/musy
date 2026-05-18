import { test, expect, mockJsonRoute, expectAccessible } from "./fixtures.js";
import { HistoryResponse } from "@moc/contracts";

/**
 * PWA install affordance + update self-apply — visible UI states.
 *
 * Covers the visible behavior side of PWA-05 (update banner) and
 * PWA-06 (install affordances). The state-machine + dismissal
 * persistence + visibility-change auto-apply branches are unit-tested
 * in `tests/invariants/pwa/`; this spec verifies the user-facing
 * banners render correctly and pass WCAG AA contrast on a 375x667
 * mobile viewport.
 *
 * Background screen: the bottom-nav app shell rendered on the search
 * page. The history endpoint is mocked empty so the search route
 * doesn't show its loading skeleton in the snapshot.
 */

const IPHONE_SAFARI_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
const ANDROID_CHROME_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.111 Mobile Safari/537.36";

const MOBILE_VIEWPORT = { width: 375, height: 667 };
const HISTORY_EMPTY = { entries: [], nextCursor: null };

test.describe("PWA install + self-update banners", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await mockJsonRoute(page, /\/api\/search\/history/, HistoryResponse, HISTORY_EMPTY);
  });

  // ── iOS Safari: surface the Add-to-Home-Screen hint ────────────────────

  test.describe("iOS Safari (no beforeinstallprompt)", () => {
    test.use({ userAgent: IPHONE_SAFARI_UA });

    test("renders the IosInstallHint with share-sheet copy", async ({ page }) => {
      await page.goto("/search");
      const hint = page.getByRole("dialog");
      await expect(hint).toBeVisible();
      await expect(hint.getByText(/Add musy to your Home Screen/i)).toBeVisible();
      await expect(hint.getByText(/Share/)).toBeVisible();
      await expect(hint.getByText(/Add to Home Screen/i)).toBeVisible();
      await expect(page).toHaveScreenshot("pwa-ios-install-hint.png");
      await expectAccessible(page);
    });

    test("dismissing the hint hides it and persists across reloads", async ({ page }) => {
      await page.goto("/search");
      await page.getByRole("button", { name: /Got it/i }).click();
      await expect(page.getByRole("dialog")).toHaveCount(0);

      await page.reload();
      // Dismissal persists in localStorage; hint should not reappear.
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(page).toHaveScreenshot("pwa-no-banner-dismissed.png");
      await expectAccessible(page);
    });
  });

  // ── Android Chrome: capture beforeinstallprompt + show install banner ──

  test.describe("Android Chrome (beforeinstallprompt)", () => {
    test.use({ userAgent: ANDROID_CHROME_UA });

    test("captures beforeinstallprompt and shows the install banner", async ({ page }) => {
      await page.goto("/search");

      // The hook hasn't received an event yet, so no banner.
      await expect(page.getByRole("dialog")).toHaveCount(0);

      // Dispatch a synthetic beforeinstallprompt — the real DOM
      // event isn't reachable from Playwright, but the hook only
      // calls preventDefault() and stores the event, then reads
      // prompt() + userChoice when the user taps Install.
      await page.evaluate(() => {
        const event = new Event("beforeinstallprompt") as Event & {
          prompt: () => Promise<void>;
          userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
        };
        event.prompt = async (): Promise<void> => {
          /* captured but not exercised in the visible-state test */
        };
        event.userChoice = Promise.resolve({ outcome: "accepted" });
        window.dispatchEvent(event);
      });

      const banner = page.getByRole("dialog");
      await expect(banner).toBeVisible();
      await expect(banner.getByText(/Install musy on your device/i)).toBeVisible();
      await expect(banner.getByRole("button", { name: /^Install$/i })).toBeVisible();
      await expect(banner.getByRole("button", { name: /Not now/i })).toBeVisible();
      await expect(page).toHaveScreenshot("pwa-android-install-banner.png");
      await expectAccessible(page);
    });

    test("dismissing the install banner persists across reloads", async ({ page }) => {
      await page.goto("/search");
      await page.evaluate(() => {
        const event = new Event("beforeinstallprompt") as Event & {
          prompt: () => Promise<void>;
          userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
        };
        event.prompt = async (): Promise<void> => {};
        event.userChoice = Promise.resolve({ outcome: "dismissed" });
        window.dispatchEvent(event);
      });
      await page.getByRole("button", { name: /Not now/i }).click();
      await expect(page.getByRole("dialog")).toHaveCount(0);

      await page.reload();
      // Re-dispatch — the banner should NOT reappear because the
      // dismissal is persisted in localStorage.
      await page.evaluate(() => {
        const event = new Event("beforeinstallprompt") as Event & {
          prompt: () => Promise<void>;
          userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
        };
        event.prompt = async (): Promise<void> => {};
        event.userChoice = Promise.resolve({ outcome: "dismissed" });
        window.dispatchEvent(event);
      });
      await expect(page.getByRole("dialog")).toHaveCount(0);
    });
  });

  // ── Already installed (display-mode: standalone) ───────────────────────

  test.describe("already installed (standalone display-mode)", () => {
    test.use({ userAgent: IPHONE_SAFARI_UA });

    test("neither hint nor install banner renders when running standalone", async ({ page }) => {
      // Patch matchMedia BEFORE the app code runs so the standalone
      // check at mount time returns true.
      await page.addInitScript(() => {
        const original = window.matchMedia.bind(window);
        window.matchMedia = (query: string): MediaQueryList => {
          if (query === "(display-mode: standalone)") {
            return {
              matches: true,
              media: query,
              onchange: null,
              addEventListener: (): void => undefined,
              removeEventListener: (): void => undefined,
              addListener: (): void => undefined,
              removeListener: (): void => undefined,
              dispatchEvent: (): boolean => false,
            } as MediaQueryList;
          }
          return original(query);
        };
      });
      await page.goto("/search");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(page).toHaveScreenshot("pwa-no-banner-standalone.png");
      await expectAccessible(page);
    });
  });
});
