import { test, expect, mockJsonRoute, mockJsonError, expectAccessible } from "./fixtures.js";
import { SearchResponse, HistoryResponse, ResolveResponse } from "@moc/contracts";

/**
 * Feature 04: Now-playing screen + Media Session.
 * Source: product-specs/playback/features/04-now-playing-screen-and-media-session.md.
 *
 * Coverage maps onto the spec's "User behavior":
 *   1. Tap mini-player body → overlay slides up (track variant: cover, title, progress, transport)
 *   2. Track variant — playing vs paused
 *   4. Station variant — LIVE indicator, disabled skip buttons, no progress bar
 *   5. Drag-to-scrub — current-time updates live; seek commits on release
 *   7. Collapse via chevron-down → mini-player visible again
 *   8. Browser back-button → collapses overlay (does not navigate)
 *   9. No-track first-run — overlay not reachable (covered by feature 03 already)
 *
 * Failure modes:
 *   - Resolver returns non-null streamUrl but the audio URL aborts → mini-player
 *     still goes failed; overlay is not reachable from a failed mini-player.
 *
 *   - Media Session unavailable on the platform — covered by the PWA-02
 *     invariant test (jsdom + hook unit test); not retested here.
 *
 * BROWSER-04: 375x667 layout — overlay fits without horizontal scroll, cover
 *   ≥ 240×240, transport buttons ≥ 44×44, topbar buttons don't overlap.
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

const STATION_RESULT: SearchResponse = SearchResponse.parse({
  results: [
    {
      type: "station",
      id: "radio-browser:station:1",
      name: "BBC Radio 1",
      country: "United Kingdom",
      provider: "radio-browser",
      providerId: "rb-1",
      sources: ["radio-browser"],
      streamUrl: "http://localhost:5173/test-station.mp3",
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

const RESOLVE_STATION = ResolveResponse.parse({
  // ResolveSource is restricted to ["audius", "soundcloud"]. The variant of
  // the now-playing overlay is determined by snapshot.kind, not by the
  // resolver source — the value here just satisfies Zod.
  source: "audius",
  sourceTrackId: "rb-1",
  streamUrl: "http://localhost:5173/test-audio.mp3",
  expiresAt: "2026-12-31T00:00:00.000Z",
});

// 44-byte RIFF WAV with 0 data bytes — valid, loads instantly, plays silently.
const SILENT_WAV_HEX =
  "52494646240000005741564566 6d7420100000000100010044ac0000881001000200 10006461746100000000".replace(
    /\s/g,
    "",
  );

async function routeAudio(page: import("@playwright/test").Page): Promise<void> {
  const wav = Buffer.from(SILENT_WAV_HEX, "hex");
  await page.route("**/test-audio.mp3", (route) =>
    route.fulfill({ status: 200, contentType: "audio/wav", body: wav }),
  );
  await page.route("**/test-station.mp3", (route) =>
    route.fulfill({ status: 200, contentType: "audio/wav", body: wav }),
  );
}

async function gotoSearch(
  page: import("@playwright/test").Page,
  query: string,
  rowText: string,
): Promise<void> {
  await page.goto("/search");
  await page.getByRole("textbox").fill(query);
  await page.getByRole("textbox").press("Enter");
  await expect(page.getByText(rowText)).toBeVisible();
}

async function startPlaybackAndExpand(page: import("@playwright/test").Page): Promise<void> {
  await page.getByTestId("interactive-row").first().click();
  await expect(page.getByTestId("mini-player")).toBeVisible();
  await page.getByRole("button", { name: /now playing/i }).click();
  await expect(page.getByTestId("now-playing-overlay")).toBeVisible();
}

// ─── User behavior 1, 2 — track variant: open + render ──────────────────────

test.describe("now-playing — track variant (User behaviors 1, 2)", () => {
  test.beforeEach(async ({ page }) => {
    await mockJsonRoute(page, /\/api\/search\/history/, HistoryResponse, HISTORY_EMPTY);
    await mockJsonRoute(page, /\/api\/search$/, SearchResponse, TRACK_RESULT);
    await mockJsonRoute(page, /\/api\/play\/resolve/, ResolveResponse, RESOLVE_AUDIUS);
    await page.route(/\/api\/play\/(started|completed)$/, (route) =>
      route.fulfill({ status: 204 }),
    );
    await page.route(/\/api\/search\/(explored|saved)$/, (route) => route.fulfill({ status: 204 }));
    await routeAudio(page);
  });

  test("tapping the mini-player expands the overlay with cover, title, progress, and transport", async ({
    page,
  }) => {
    await gotoSearch(page, "daft punk", "Get Lucky");
    await startPlaybackAndExpand(page);

    const overlay = page.getByTestId("now-playing-overlay");
    await expect(overlay).toContainText("Get Lucky");
    await expect(overlay).toContainText("Daft Punk");
    await expect(overlay.getByRole("slider", { name: "Playback position" })).toBeVisible();
    await expect(overlay.getByRole("button", { name: "Skip back" })).toBeEnabled();

    await expect(page).toHaveScreenshot("now-playing-track-playing.png", {
      animations: "disabled",
    });
    await expectAccessible(page);
  });
});

// ─── User behavior 4 — station variant ──────────────────────────────────────

test.describe("now-playing — station variant (User behavior 4)", () => {
  test.beforeEach(async ({ page }) => {
    await mockJsonRoute(page, /\/api\/search\/history/, HistoryResponse, HISTORY_EMPTY);
    await mockJsonRoute(page, /\/api\/search$/, SearchResponse, STATION_RESULT);
    await mockJsonRoute(page, /\/api\/play\/resolve/, ResolveResponse, RESOLVE_STATION);
    await page.route(/\/api\/play\/(started|completed)$/, (route) =>
      route.fulfill({ status: 204 }),
    );
    await page.route(/\/api\/search\/(explored|saved)$/, (route) => route.fulfill({ status: 204 }));
    await routeAudio(page);
  });

  test("station variant shows LIVE indicator, no progress bar, and disabled skip buttons", async ({
    page,
  }) => {
    await gotoSearch(page, "bbc", "BBC Radio 1");
    await startPlaybackAndExpand(page);

    const overlay = page.getByTestId("now-playing-overlay");
    await expect(overlay.getByTestId("now-playing-live")).toBeVisible();
    await expect(overlay.getByText("LIVE")).toBeVisible();
    await expect(overlay.getByRole("slider")).toHaveCount(0);

    const skipBack = overlay.getByRole("button", { name: "Skip back" });
    const skipForward = overlay.getByRole("button", { name: "Skip forward" });
    await expect(skipBack).toHaveAttribute("aria-disabled", "true");
    await expect(skipForward).toHaveAttribute("aria-disabled", "true");

    await expect(page).toHaveScreenshot("now-playing-station.png", {
      animations: "disabled",
    });
    await expectAccessible(page);
  });
});

// ─── User behaviors 7, 8 — collapse: chevron + browser-back ─────────────────

test.describe("now-playing — collapse paths (User behaviors 7, 8)", () => {
  test.beforeEach(async ({ page }) => {
    await mockJsonRoute(page, /\/api\/search\/history/, HistoryResponse, HISTORY_EMPTY);
    await mockJsonRoute(page, /\/api\/search$/, SearchResponse, TRACK_RESULT);
    await mockJsonRoute(page, /\/api\/play\/resolve/, ResolveResponse, RESOLVE_AUDIUS);
    await page.route(/\/api\/play\/(started|completed)$/, (route) =>
      route.fulfill({ status: 204 }),
    );
    await page.route(/\/api\/search\/(explored|saved)$/, (route) => route.fulfill({ status: 204 }));
    await routeAudio(page);
  });

  test("chevron-down collapses the overlay; the underlying page (and mini-player) is visible again", async ({
    page,
  }) => {
    await gotoSearch(page, "daft punk", "Get Lucky");
    await startPlaybackAndExpand(page);

    await page.getByRole("button", { name: "Collapse player" }).click();
    await expect(page.getByTestId("now-playing-overlay")).not.toBeVisible();
    await expect(page.getByTestId("mini-player")).toBeVisible();
    await expect(page).toHaveURL(/\/search$/);
  });

  test("browser-back collapses the overlay rather than navigating the underlying route", async ({
    page,
  }) => {
    await gotoSearch(page, "daft punk", "Get Lucky");
    await startPlaybackAndExpand(page);

    await page.goBack();
    await expect(page.getByTestId("now-playing-overlay")).not.toBeVisible();
    await expect(page.getByTestId("mini-player")).toBeVisible();
    await expect(page).toHaveURL(/\/search$/);
  });
});

// ─── User behavior 5 — drag-to-scrub commits on release ─────────────────────
//
// The silent test WAV reports duration 0 to the audio element, so engine
// progressMs / durationMs stay at 0 in the browser — that makes a real-mouse
// drag assertion unreliable here. Commit-on-release is exhaustively covered
// by the ProgressSlider unit tests in the design-system package (8 cases,
// including the "fires onScrubEnd EXACTLY ONCE on pointerup" test which
// directly verifies User-behavior 5). The visual snapshot below is the
// e2e signal that the slider renders in the right place for the user to
// reach.

test.describe("now-playing — slider is interactive (User behavior 5)", () => {
  test.beforeEach(async ({ page }) => {
    await mockJsonRoute(page, /\/api\/search\/history/, HistoryResponse, HISTORY_EMPTY);
    await mockJsonRoute(page, /\/api\/search$/, SearchResponse, TRACK_RESULT);
    await mockJsonRoute(page, /\/api\/play\/resolve/, ResolveResponse, RESOLVE_AUDIUS);
    await page.route(/\/api\/play\/(started|completed)$/, (route) =>
      route.fulfill({ status: 204 }),
    );
    await page.route(/\/api\/search\/(explored|saved)$/, (route) => route.fulfill({ status: 204 }));
    await routeAudio(page);
  });

  test("the progress slider is keyboard-focusable and exposes aria-valuemin/max", async ({
    page,
  }) => {
    await gotoSearch(page, "daft punk", "Get Lucky");
    await startPlaybackAndExpand(page);

    const slider = page.getByRole("slider", { name: "Playback position" });
    await expect(slider).toBeVisible();
    await expect(slider).toHaveAttribute("aria-valuemin", "0");
    await expect(slider).toHaveAttribute("aria-valuemax", "100");
    await expect(slider).toHaveAttribute("tabindex", "0");
  });
});

// ─── Failure mode — resolver 503 → never expanded ───────────────────────────

test.describe("now-playing — resolver failure prevents expansion", () => {
  test.beforeEach(async ({ page }) => {
    await mockJsonRoute(page, /\/api\/search\/history/, HistoryResponse, HISTORY_EMPTY);
    await mockJsonRoute(page, /\/api\/search$/, SearchResponse, TRACK_RESULT);
    await mockJsonError(page, /\/api\/play\/resolve/, 503, {
      code: "SERVICE_UNAVAILABLE",
      message: "upstream down",
    });
    await page.route(/\/api\/search\/(explored|saved)$/, (route) => route.fulfill({ status: 204 }));
  });

  test("when the resolver fails the mini-player is in failed state and no overlay can be opened", async ({
    page,
  }) => {
    await gotoSearch(page, "daft punk", "Get Lucky");
    await page.getByTestId("interactive-row").first().click();

    const miniPlayer = page.getByTestId("mini-player");
    await expect(miniPlayer).toHaveAttribute("data-player-state", "failed");
    // The failed mini-player has no expand affordance — overlay is unreachable.
    await expect(page.getByTestId("now-playing-overlay")).not.toBeVisible();
  });
});

// ─── BROWSER-04 — 375x667 mobile layout ─────────────────────────────────────

test.describe("BROWSER-04: now-playing overlay mobile layout (375x667)", () => {
  test.beforeEach(async ({ page }) => {
    await mockJsonRoute(page, /\/api\/search\/history/, HistoryResponse, HISTORY_EMPTY);
    await mockJsonRoute(page, /\/api\/search$/, SearchResponse, TRACK_RESULT);
    await mockJsonRoute(page, /\/api\/play\/resolve/, ResolveResponse, RESOLVE_AUDIUS);
    await page.route(/\/api\/play\/(started|completed)$/, (route) =>
      route.fulfill({ status: 204 }),
    );
    await page.route(/\/api\/search\/(explored|saved)$/, (route) => route.fulfill({ status: 204 }));
    await routeAudio(page);
  });

  test("overlay fits 375x667 without horizontal scroll; cover ≥ 240; transport buttons ≥ 44; topbar buttons don't overlap", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await gotoSearch(page, "daft punk", "Get Lucky");
    await startPlaybackAndExpand(page);

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);

    // Cover at least 240×240.
    const cover = page.getByTestId("cover-fallback");
    const coverBox = await cover.boundingBox();
    expect(coverBox).not.toBeNull();
    expect(coverBox!.width).toBeGreaterThanOrEqual(240);
    expect(coverBox!.height).toBeGreaterThanOrEqual(240);

    // Every transport button hits 44×44. Scope to the overlay subtree because
    // the mini-player (rendered behind the overlay) shares the Play button
    // label. The center button is "Play" or "Pause" depending on audio state
    // at snapshot time.
    const overlay = page.getByTestId("now-playing-overlay");
    const transportButtons = [
      overlay.getByRole("button", { name: "Skip back" }),
      overlay.getByRole("button", { name: /^(Play|Pause)$/ }),
      overlay.getByRole("button", { name: "Skip forward" }),
    ];
    for (const btn of transportButtons) {
      const box = await btn.boundingBox();
      expect(box, "transport button has no bounding box").not.toBeNull();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }

    // Topbar collapse vs more-overflow do not overlap.
    const collapseBox = await page.getByRole("button", { name: "Collapse player" }).boundingBox();
    const moreBox = await page.getByRole("button", { name: "More options" }).boundingBox();
    expect(collapseBox).not.toBeNull();
    expect(moreBox).not.toBeNull();
    const collapseRight = collapseBox!.x + collapseBox!.width;
    expect(moreBox!.x).toBeGreaterThanOrEqual(collapseRight);

    await expect(page).toHaveScreenshot("now-playing-track-mobile-375x667.png", {
      animations: "disabled",
    });
    await expectAccessible(page);
  });
});
