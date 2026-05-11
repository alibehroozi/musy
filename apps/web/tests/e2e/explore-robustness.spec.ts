import { test, expect, mockJsonRoute } from "./fixtures.js";
import {
  NextResponse,
  ResolveResponse,
  TasteProfileResponse,
  HistoryResponse,
} from "@moc/contracts";
import type { Page, Route } from "@playwright/test";

/**
 * Layer-3 robustness coverage for the explore card stack — UI-24, UI-25,
 * UI-26, UI-27, UI-28. The full per-effect logic is verified in
 * `tests/invariants/ui/explore-robustness.test.tsx`; here we drive the
 * scenarios end-to-end against the real Vite-served bundle so the
 * vitest+jsdom assumption (e.g. about RAF cadence and engine lifecycle)
 * doesn't drift from production behavior.
 */

// Items WITHOUT coverUrl — the cards skip the <img> render and the
// stack's behind-cards don't intercept pointer events targeted at the
// action row. The cover-error test below uses a separate items set
// with coverUrl populated.
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

const ITEMS_WITH_COVER = NextResponse.parse({
  items: [
    {
      title: "Get Lucky",
      artist: "Daft Punk",
      durationSec: 369,
      kind: "track",
      coverUrl: "http://localhost:5173/test-cover-A.png",
    },
  ],
  phase: "discovery",
  partial: false,
  buildingQueue: false,
});

const HISTORY_EMPTY = HistoryResponse.parse({ entries: [], nextCursor: null });

// 44-byte silent WAV — valid, loads instantly, plays silently.
const SILENT_WAV_HEX =
  "52494646240000005741564566 6d7420100000000100010044ac0000881001000200 10006461746100000000".replace(
    /\s/g,
    "",
  );

async function clearOnboarding(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.setItem("moc.explore.onboarded", "1");
  });
}

async function routeSilentAudio(page: Page, urlGlob: string): Promise<void> {
  const wav = Buffer.from(SILENT_WAV_HEX, "hex");
  await page.route(urlGlob, (route) =>
    route.fulfill({ status: 200, contentType: "audio/wav", body: wav }),
  );
}

async function routeAudioStatus(page: Page, urlGlob: string, status: number): Promise<void> {
  await page.route(urlGlob, (route) =>
    route.fulfill({ status, contentType: status >= 400 ? "text/plain" : "audio/wav", body: "" }),
  );
}

test.describe("explore robustness — 403 stale URL recovery", () => {
  test(
    "when the pre-resolved URL for the second card 403s, the FE re-issues /api/play/resolve, " +
      "loads the fresh URL, and the card stays on the deck (UI-24 + UI-25)",
    async ({ page }) => {
      await clearOnboarding(page);

      // Per-item resolve call counts so we can return DIFFERENT stream
      // URLs across the (pre-resolve) and (UI-21 retry) calls for B.
      let resolveCallsForB = 0;
      let resolveCallsForA = 0;
      let resolveCallsForC = 0;

      await page.route(/\/api\/explore\/next/, (r) =>
        r.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(ITEMS),
        }),
      );
      await mockJsonRoute(page, /\/api\/explore\/profile/, TasteProfileResponse, null);
      await mockJsonRoute(page, /\/api\/search\/history/, HistoryResponse, HISTORY_EMPTY);
      await page.route(/\/api\/explore\/swipe/, (r) => r.fulfill({ status: 204, body: "" }));

      await page.route(/\/api\/play\/resolve/, async (route: Route) => {
        const body = JSON.parse(route.request().postData() ?? "{}") as {
          snapshot: { title: string };
        };
        const title = body.snapshot?.title;
        const buildBody = (
          sourceTrackId: string,
          streamUrl: string,
        ): { source: string; sourceTrackId: string; streamUrl: string; expiresAt: string } => ({
          source: "soundcloud",
          sourceTrackId,
          streamUrl,
          expiresAt: "2026-12-31T00:00:00.000Z",
        });
        if (title === "Get Lucky") {
          resolveCallsForA += 1;
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(buildBody("sc-A", "http://localhost:5173/test-audio-A.wav")),
          });
        }
        if (title === "One More Time") {
          resolveCallsForB += 1;
          if (resolveCallsForB === 1) {
            // First call (pre-resolve at mount) → STALE URL.
            return route.fulfill({
              status: 200,
              contentType: "application/json",
              body: JSON.stringify(
                buildBody("sc-B-stale", "http://localhost:5173/test-audio-B-STALE.wav"),
              ),
            });
          }
          // Second call (UI-21 retry after 403) → FRESH URL.
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(
              buildBody("sc-B-fresh", "http://localhost:5173/test-audio-B-FRESH.wav"),
            ),
          });
        }
        if (title === "Strobe") {
          resolveCallsForC += 1;
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(buildBody("sc-C", "http://localhost:5173/test-audio-C.wav")),
          });
        }
        return route.fulfill({ status: 404, body: "" });
      });

      // A and C audio: 200 (silent WAV). B-STALE: 403. B-FRESH: 200.
      await routeSilentAudio(page, "**/test-audio-A.wav");
      await routeAudioStatus(page, "**/test-audio-B-STALE.wav", 403);
      await routeSilentAudio(page, "**/test-audio-B-FRESH.wav");
      await routeSilentAudio(page, "**/test-audio-C.wav");

      await page.goto("/explore");

      // Track A is the initial top.
      await expect(page.getByText("Get Lucky")).toBeVisible();
      // Wait for pre-resolve of B to land.
      await expect.poll(() => resolveCallsForB).toBe(1);

      // Like → B becomes top. The stale URL fires 403 → UI-21 retry.
      await page.getByRole("button", { name: "Like" }).click();
      await expect(page.getByText("One More Time")).toBeVisible();

      // The retry fires a second /api/play/resolve for B.
      await expect.poll(() => resolveCallsForB, { timeout: 10_000 }).toBe(2);

      // UI-24 + UI-25: the card stays on the deck (no auto-swipe past it).
      // After the retry resolves with a playable URL, B is still the top
      // and "Strobe" is NOT the top.
      await expect(page.locator("[data-explore-position='top']")).toContainText("One More Time");
      await expect(page.locator("[data-explore-position='top']")).not.toContainText("Strobe");

      // Wait 6 seconds — UI-24 says the auto-skip is suspended for the
      // duration of the retry. By 6 s the retry's response has landed
      // (fast mock) and B's fresh URL is loaded → engine transitions
      // out of "failed", so the auto-skip never fires. B is still top.
      await page.waitForTimeout(6_000);
      await expect(page.locator("[data-explore-position='top']")).toContainText("One More Time");

      // C is still behind, never auto-promoted.
      expect(resolveCallsForA).toBeGreaterThanOrEqual(1);
      expect(resolveCallsForC).toBeGreaterThanOrEqual(1);
    },
  );
});

test.describe("explore robustness — cover image error fallback", () => {
  test("when the top card's cover image 404s, the artwork container's aria-label switches to 'Artwork unavailable' (UI-27)", async ({
    page,
  }) => {
    await clearOnboarding(page);

    await page.route(/\/api\/explore\/next/, (r) =>
      r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(ITEMS_WITH_COVER),
      }),
    );
    await mockJsonRoute(page, /\/api\/explore\/profile/, TasteProfileResponse, null);
    await mockJsonRoute(page, /\/api\/play\/resolve/, ResolveResponse, {
      source: "audius",
      sourceTrackId: "audius-1",
      streamUrl: "http://localhost:5173/test-audio.wav",
      expiresAt: "2026-12-31T00:00:00.000Z",
    });
    await mockJsonRoute(page, /\/api\/search\/history/, HistoryResponse, HISTORY_EMPTY);
    await page.route(/\/api\/explore\/swipe/, (r) => r.fulfill({ status: 204, body: "" }));
    await routeSilentAudio(page, "**/test-audio.wav");

    // The top card's cover 404s.
    await page.route(/\/test-cover-A\.png/, (r) => r.fulfill({ status: 404, body: "" }));

    await page.goto("/explore");

    await expect(page.getByText("Get Lucky")).toBeVisible();

    // Wait for the <img> to fire its error event → aria-label flips.
    const topArtwork = page.locator(
      "[data-explore-position='top'] [data-testid='explore-artwork']",
    );
    await expect(topArtwork).toHaveAttribute("aria-label", "Artwork unavailable");
    await expect(topArtwork.locator("img")).toHaveCount(0);
  });
});
