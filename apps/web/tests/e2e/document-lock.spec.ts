import { test, expect, mockJsonRoute } from "./fixtures.js";
import { HistoryResponse } from "@moc/contracts";

/**
 * BROWSER-10 — iOS PWA document viewport lock.
 *
 * On iPhone in PWA standalone, before the lock the user could touch
 * the bottom-nav and pull the whole fixed wrapper downward, with iOS
 * exposing a strip of var(--color-bg) below the nav (roughly the
 * size of env(safe-area-inset-top)) during the elastic rubber-band.
 *
 * Headless Chromium doesn't replay iOS's elastic overscroll, so we
 * can't synthesize the visual repro — instead we pin the underlying
 * CSS that defeats it. The computed styles on html/body and the
 * inner scroll container are the platform-independent invariant
 * that iOS Safari + WebKit honor in production.
 */

const HISTORY_EMPTY = HistoryResponse.parse({ entries: [], nextCursor: null });

test.describe("BROWSER-10 — iOS PWA document viewport lock", () => {
  test("html and body are locked: overflow:hidden, height:100%, overscroll-behavior:none", async ({
    page,
  }) => {
    await mockJsonRoute(page, /\/api\/search\/history/, HistoryResponse, HISTORY_EMPTY);
    await page.goto("/search");

    const lock = await page.evaluate(() => {
      const html = window.getComputedStyle(document.documentElement);
      const body = window.getComputedStyle(document.body);
      return {
        htmlOverflowY: html.overflowY,
        htmlOverscroll: html.overscrollBehavior,
        bodyOverflowY: body.overflowY,
        bodyOverscroll: body.overscrollBehavior,
        // Both should be sized to the viewport so there is no native
        // scrollable area left for the document to bounce through.
        viewportHeight: window.innerHeight,
        htmlHeight: document.documentElement.clientHeight,
        bodyHeight: document.body.clientHeight,
      };
    });

    expect(lock.htmlOverflowY).toBe("hidden");
    expect(lock.htmlOverscroll).toBe("none");
    expect(lock.bodyOverflowY).toBe("hidden");
    expect(lock.bodyOverscroll).toBe("none");
    expect(lock.htmlHeight).toBe(lock.viewportHeight);
    expect(lock.bodyHeight).toBe(lock.viewportHeight);
  });

  test("the App-shell scroll container has overscroll-behavior:contain", async ({ page }) => {
    await mockJsonRoute(page, /\/api\/search\/history/, HistoryResponse, HISTORY_EMPTY);
    await page.goto("/search");

    const scroll = page.getByTestId("app-shell-scroll");
    await expect(scroll).toBeVisible();

    const overscroll = await scroll.evaluate(
      (el) => window.getComputedStyle(el).overscrollBehavior,
    );
    // `contain` stops the scroll-chain at the container; `none` is a
    // stricter superset and also acceptable.
    expect(overscroll).toMatch(/^(contain|none)$/);
  });
});
