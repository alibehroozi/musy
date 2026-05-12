import { test, expect, mockJsonRoute, mockJsonError, expectAccessible } from "./fixtures.js";
import {
  HistoryResponse,
  NextResponse,
  ResolveResponse,
  SearchResponse,
  TasteProfileResponse,
} from "@moc/contracts";
import type { Page } from "@playwright/test";

/**
 * UI-32: "Bad remix" rotates the current SoundCloud resolution for a song
 * to a different track and replays the same SongSnapshot. The button must
 * be present on both the Explore swipe card cover AND the Now Playing
 * overlay; clicking it preserves the active snapshot identity.
 *
 * The backend contracts pinned here:
 *   - API-22: POST /api/play/reresolve — auth-gated, ResolveResponse body.
 *   - API-23: subsequent /api/play/resolve consults preferences first.
 *
 * UI-32 specifically requires the same SongSnapshot remains the active
 * track after the network call resolves — the audio source rotates,
 * the metadata does not.
 */

const TRACK_SEARCH = SearchResponse.parse({
  results: [
    {
      type: "track",
      id: "deezer:track:1",
      title: "Without Me",
      artist: "Eminem",
      provider: "deezer",
      providerId: "deezer-1",
      sources: ["deezer"],
    },
  ],
  partial: false,
  failedProviders: [],
  cached: false,
});

const NEXT_ITEMS = NextResponse.parse({
  items: [
    {
      title: "Without Me",
      artist: "Eminem",
      durationSec: 290,
      kind: "track",
    },
    {
      title: "Lose Yourself",
      artist: "Eminem",
      durationSec: 326,
      kind: "track",
    },
  ],
  phase: "discovery",
  partial: false,
  buildingQueue: false,
});

const RESOLVE_ORIGINAL = ResolveResponse.parse({
  source: "soundcloud",
  sourceTrackId: "sc-original",
  streamUrl: "http://localhost:5173/test-audio.mp3",
  expiresAt: "2026-12-31T00:00:00.000Z",
});

const RERESOLVE_NEW = ResolveResponse.parse({
  source: "soundcloud",
  sourceTrackId: "sc-fresh",
  streamUrl: "http://localhost:5173/test-audio-fresh.mp3",
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
  await page.route("**/test-audio-fresh.mp3", (route) =>
    route.fulfill({ status: 200, contentType: "audio/wav", body: wav }),
  );
}

async function clearExploreOnboarding(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.setItem("moc.explore.onboarded", "1");
  });
}

async function mockExploreEndpoints(page: Page): Promise<void> {
  await mockJsonRoute(page, /\/api\/explore\/next/, NextResponse, NEXT_ITEMS);
  await mockJsonRoute(page, /\/api\/explore\/profile/, TasteProfileResponse, null);
  await mockJsonRoute(page, /\/api\/play\/resolve$/, ResolveResponse, RESOLVE_ORIGINAL);
  await mockJsonRoute(page, /\/api\/play\/reresolve$/, ResolveResponse, RERESOLVE_NEW);
  await mockJsonRoute(page, /\/api\/search\/history/, HistoryResponse, HISTORY_EMPTY);
  await page.route(/\/api\/explore\/swipe/, (route) => route.fulfill({ status: 204, body: "" }));
  await routeAudio(page);
}

async function mockSearchAndPlay(page: Page): Promise<void> {
  await mockJsonRoute(page, /\/api\/search\/history/, HistoryResponse, HISTORY_EMPTY);
  await mockJsonRoute(page, /\/api\/search$/, SearchResponse, TRACK_SEARCH);
  await mockJsonRoute(page, /\/api\/play\/resolve$/, ResolveResponse, RESOLVE_ORIGINAL);
  await mockJsonRoute(page, /\/api\/play\/reresolve$/, ResolveResponse, RERESOLVE_NEW);
  await page.route(/\/api\/play\/(started|completed)$/, (route) => route.fulfill({ status: 204 }));
  await page.route(/\/api\/search\/(explored|saved)$/, (route) => route.fulfill({ status: 204 }));
  await routeAudio(page);
}

test.describe("UI-32: Bad Remix button — Explore card cover", () => {
  test.beforeEach(async ({ page }) => {
    await clearExploreOnboarding(page);
    await mockExploreEndpoints(page);
  });

  test("renders the Bad Remix button on the top card", async ({ page }) => {
    await page.goto("/explore");
    await expect(page.getByText("Without Me")).toBeVisible();

    const button = page.getByRole("button", { name: "Bad remix" }).first();
    await expect(button).toBeVisible();

    await expect(page).toHaveScreenshot("explore-bad-remix-default.png", {
      animations: "disabled",
    });
    await expectAccessible(page);
  });

  test("clicking the button keeps the active snapshot — same song, new stream", async ({
    page,
  }) => {
    let reresolveCalls = 0;
    await page.route(/\/api\/play\/reresolve$/, async (route) => {
      reresolveCalls += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(RERESOLVE_NEW),
      });
    });

    await page.goto("/explore");
    await expect(page.getByText("Without Me")).toBeVisible();
    // force:true bypasses Playwright's stability heuristic — the top card
    // re-renders on every audio-progress tick (CardContent receives a new
    // progressFraction prop ~60×/s), and the strict click waits for
    // "element stable". The DOM node itself is the same React-reconciled
    // element across those renders; the click is safe.
    await page.getByRole("button", { name: "Bad remix" }).first().click({ force: true });

    // Wait for the fetch to fire and resolve.
    await expect.poll(() => reresolveCalls).toBeGreaterThan(0);

    // UI-32: the same SongSnapshot remains active. The card still reads
    // "Without Me" — only the underlying source track changed.
    await expect(page.getByText("Without Me")).toBeVisible();
    // The next card ("Lose Yourself") must NOT have advanced into the top
    // slot — Bad Remix is not a swipe.
    await expect(page.locator("[data-explore-position='top']")).toContainText("Without Me");
  });
});

test.describe("UI-32: Bad Remix button — Now Playing overlay", () => {
  test.beforeEach(async ({ page }) => {
    await mockSearchAndPlay(page);
  });

  test("renders the Bad Remix button inside the Now Playing overlay", async ({ page }) => {
    await page.goto("/search");
    await page.getByRole("textbox").fill("eminem");
    await page.getByRole("textbox").press("Enter");
    await expect(page.getByText("Without Me")).toBeVisible();

    await page.getByTestId("interactive-row").first().click();
    await expect(page.getByTestId("mini-player")).toBeVisible();
    await page.getByRole("button", { name: /now playing/i }).click();
    await expect(page.getByTestId("now-playing-overlay")).toBeVisible();

    const overlay = page.getByTestId("now-playing-overlay");
    await expect(overlay.getByRole("button", { name: "Bad remix" })).toBeVisible();

    await expect(page).toHaveScreenshot("now-playing-bad-remix.png", {
      animations: "disabled",
    });
    await expectAccessible(page);
  });

  test("clicking the Now Playing Bad Remix button keeps the overlay open with the same song", async ({
    page,
  }) => {
    let reresolveCalls = 0;
    await page.route(/\/api\/play\/reresolve$/, async (route) => {
      reresolveCalls += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(RERESOLVE_NEW),
      });
    });

    await page.goto("/search");
    await page.getByRole("textbox").fill("eminem");
    await page.getByRole("textbox").press("Enter");
    await page.getByTestId("interactive-row").first().click();
    await expect(page.getByTestId("mini-player")).toBeVisible();
    await page.getByRole("button", { name: /now playing/i }).click();

    const overlay = page.getByTestId("now-playing-overlay");
    await expect(overlay).toBeVisible();
    await expect(overlay).toContainText("Without Me");

    await overlay.getByRole("button", { name: "Bad remix" }).click();

    await expect.poll(() => reresolveCalls).toBeGreaterThan(0);

    // UI-32: overlay still up, same song.
    await expect(overlay).toBeVisible();
    await expect(overlay).toContainText("Without Me");
  });

  test("API failure on /play/reresolve does NOT crash the overlay", async ({ page }) => {
    await mockJsonError(page, /\/api\/play\/reresolve$/, 502, {
      code: "UPSTREAM_ERROR",
      message: "Provider timed out",
    });

    await page.goto("/search");
    await page.getByRole("textbox").fill("eminem");
    await page.getByRole("textbox").press("Enter");
    await page.getByTestId("interactive-row").first().click();
    await expect(page.getByTestId("mini-player")).toBeVisible();
    await page.getByRole("button", { name: /now playing/i }).click();

    const overlay = page.getByTestId("now-playing-overlay");
    await overlay.getByRole("button", { name: "Bad remix" }).click();

    // Overlay remains visible; same snapshot. The button re-enables (a
    // failed click shouldn't permanently lock it).
    await expect(overlay).toBeVisible();
    await expect(overlay).toContainText("Without Me");
    await expect(overlay.getByRole("button", { name: "Bad remix" })).toBeEnabled();
  });
});
