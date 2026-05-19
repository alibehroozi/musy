import { test, expect, mockJsonRoute } from "./fixtures.js";
import { HistoryResponse, SearchResponse, ResolveResponse } from "@moc/contracts";

/**
 * BROWSER-09 — top safe-area inset on PWA standalone.
 *
 * iOS PWA with apple-mobile-web-app-status-bar-style: black-translucent
 * + viewport-fit=cover lets the OS status bar (clock, notch) sit on top
 * of web content. Without env(safe-area-inset-top) padding on the
 * outermost full-screen containers, the page text overlaps the time —
 * the bug this regression test pins down.
 *
 * We can't simulate a real iOS inset in Playwright headless Chromium
 * (env(safe-area-inset-*) is set by the user agent and is 0 in
 * desktop Chrome). Instead we assert the source-of-truth: the inline
 * `style.paddingTop` on each top-anchored full-screen container
 * declaratively references `env(safe-area-inset-top)`. On real iOS
 * the same declaration resolves to the device's actual inset; on
 * desktop / Android tab it resolves to 0 and the layout is
 * unchanged. So the inline declaration is the invariant that
 * survives the platform difference.
 *
 * We also assert that the app shell wrapper does NOT layer its own
 * paddingBottom — the bottom-nav owns the bottom inset (BROWSER-01),
 * and stacking another env(safe-area-inset-bottom) on the wrapper
 * would lift the nav off the viewport bottom and break the
 * native-feel "stuck to the bottom" rule.
 */

const HISTORY_EMPTY = HistoryResponse.parse({ entries: [], nextCursor: null });

const TRACK_RESULT: SearchResponse = SearchResponse.parse({
  results: [
    {
      type: "track",
      id: "audius:track:1",
      title: "Get Lucky",
      artist: "Daft Punk",
      duration: 369,
      provider: "audius",
      providerId: "audius-1",
      sources: ["audius"],
    },
  ],
  partial: false,
  failedProviders: [],
  cached: false,
});

const RESOLVE_AUDIUS = ResolveResponse.parse({
  source: "audius",
  sourceTrackId: "audius-1",
  streamUrl: "http://localhost:5173/test-audio.mp3",
  expiresAt: "2026-12-31T00:00:00.000Z",
});

// 44-byte RIFF WAV with 0 data bytes — valid, plays silently and instantly.
const SILENT_WAV_HEX =
  "52494646240000005741564566 6d7420100000000100010044ac0000881001000200 10006461746100000000".replace(
    /\s/g,
    "",
  );

test.describe("BROWSER-09 — top safe-area inset on PWA standalone", () => {
  test("the app shell's outermost container declares padding-top: env(safe-area-inset-top) and no bottom inset", async ({
    page,
  }) => {
    await mockJsonRoute(page, /\/api\/search\/history/, HistoryResponse, HISTORY_EMPTY);
    await page.goto("/search");

    const shell = page.getByTestId("app-shell");
    await expect(shell).toBeVisible();

    const { paddingTop, paddingBottom } = await shell.evaluate((el) => {
      const s = (el as HTMLElement).style;
      return { paddingTop: s.paddingTop, paddingBottom: s.paddingBottom };
    });
    expect(paddingTop).toMatch(/safe-area-inset-top/);
    // Wrapper must not stack a bottom inset — bottom-nav handles its own.
    expect(paddingBottom).not.toMatch(/safe-area-inset-bottom/);
  });

  test("the now-playing overlay's outer container declares padding-top: env(safe-area-inset-top)", async ({
    page,
  }) => {
    await mockJsonRoute(page, /\/api\/search\/history/, HistoryResponse, HISTORY_EMPTY);
    await mockJsonRoute(page, /\/api\/search$/, SearchResponse, TRACK_RESULT);
    await mockJsonRoute(page, /\/api\/play\/resolve/, ResolveResponse, RESOLVE_AUDIUS);
    await page.route(/\/api\/play\/(started|completed)$/, (route) =>
      route.fulfill({ status: 204 }),
    );
    await page.route(/\/api\/search\/(explored|saved)$/, (route) => route.fulfill({ status: 204 }));
    const wav = Buffer.from(SILENT_WAV_HEX, "hex");
    await page.route("**/test-audio.mp3", (route) =>
      route.fulfill({ status: 200, contentType: "audio/wav", body: wav }),
    );

    await page.goto("/search");
    await page.getByRole("textbox").fill("daft punk");
    await page.getByRole("textbox").press("Enter");
    await expect(page.getByText("Get Lucky")).toBeVisible();

    await page.getByTestId("interactive-row").first().click();
    await expect(page.getByTestId("mini-player")).toBeVisible();
    await page.getByRole("button", { name: /now playing/i }).click();

    const overlay = page.getByTestId("now-playing-overlay");
    await expect(overlay).toBeVisible();

    const paddingTopDecl = await overlay.evaluate((el) => (el as HTMLElement).style.paddingTop);
    expect(paddingTopDecl).toMatch(/safe-area-inset-top/);
  });
});
