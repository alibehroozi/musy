import { test, expect, mockJsonRoute, mockJsonError, expectAccessible } from "./fixtures.js";
import {
  BucketDetailResponse,
  TasteBucketsResponse,
  type BucketDetailResponse as BucketDetailBody,
  type TasteBucket,
} from "@moc/contracts";
import type { Page } from "@playwright/test";

/**
 * Feature 08: bucket detail UI.
 * Source: product-specs/taste/features/08-bucket-detail-ui.md.
 *
 * Coverage maps onto the spec's "User behavior" + failure modes + the
 * BROWSER-08 invariants. Every `toHaveScreenshot(...)` pairs with
 * `expectAccessible(page)` per AGENTS.md hard rule #13. All mocked
 * responses are typed via `mockJsonRoute` / `mockJsonError` against
 * `@moc/contracts` schemas so a contract drift fails at mock-write
 * time, not in a flaky run.
 *
 *   1. Ready-populated state — pixel-locks the design mockup; back
 *      affordance navigates to /taste; Play all is rendered; song list
 *      is in server-emitted order; provider badge derived from songKey
 *      (UI-37, BROWSER-08).
 *   2. Building state — "Building…" subtitle, no song list, no
 *      Play all (UI-37, BROWSER-08).
 *   3. Failed state — errorReason rendered (UI-37, BROWSER-08).
 *   4. Empty-songs ready state — "(no songs yet)" caption visible,
 *      Play all hidden (UI-37 boundary).
 *   5. 404 — "Bucket not found" + back link (UI-37 failure branch).
 *   6. Server error — retry button restores the page on the next
 *      successful response (UI-37 failure branch).
 *   7. Tap song row → POST /play/started fires with the bucket origin
 *      (UI-38).
 *   8. Tap Play all → first POST /play/started fires with bucketId +
 *      bucketKind (UI-38).
 *   9. Touch-target sizes for back affordance and Play all (BROWSER-08).
 *  10. Navigation: tapping a ready bucket card on /taste navigates to
 *      /taste/buckets/:bucketId.
 */

// ────────────────────────────────────────────────────────────────────────
// Fixture buckets + songs
// ────────────────────────────────────────────────────────────────────────

const READY_BUCKET: TasteBucket = {
  id: "00000000-0000-4000-8000-00000000bd00",
  userId: "00000000-0000-4000-8000-000000000001",
  name: "Late night drives",
  description: null,
  kind: "auto",
  state: "ready",
  promptText: null,
  errorReason: null,
  createdAt: "2026-05-15T10:00:00.000Z",
  lastBuiltAt: "2026-05-15T10:01:00.000Z",
  coverArtworkUrl: null,
};

const EMPTY_BUCKET: TasteBucket = {
  ...READY_BUCKET,
  id: "00000000-0000-4000-8000-00000000bdee",
  name: "Empty mix",
};

function buildingNow(): TasteBucket {
  const nowIso = new Date().toISOString();
  return {
    ...READY_BUCKET,
    id: "00000000-0000-4000-8000-00000000bdbb",
    name: "Building mix",
    state: "building",
    kind: "custom",
    promptText: "rainy day jazz",
    createdAt: nowIso,
    lastBuiltAt: nowIso,
  };
}

const FAILED_BUCKET: TasteBucket = {
  ...READY_BUCKET,
  id: "00000000-0000-4000-8000-00000000bdff",
  name: "Broken mix",
  state: "failed",
  kind: "custom",
  promptText: "midnight metal jazz fusion",
  errorReason: "Not enough signal yet — swipe a few more songs.",
};

const READY_DETAIL: BucketDetailBody = {
  bucket: READY_BUCKET,
  songs: [
    {
      songKey: "soundcloud:track-1",
      snapshot: { title: "Whatever", artist: "The Strokes", kind: "track" },
      score: 95,
    },
    {
      songKey: "soundcloud:track-2",
      snapshot: { title: "Strange brew", artist: "Cream", kind: "track" },
      score: 80,
    },
    {
      songKey: "audius:track-3",
      snapshot: { title: "Midnight city", artist: "M83", kind: "track" },
      score: 60,
    },
  ],
};

const EMPTY_DETAIL: BucketDetailBody = {
  bucket: EMPTY_BUCKET,
  songs: [],
};

function buildingDetail(): BucketDetailBody {
  return { bucket: buildingNow(), songs: [] };
}

const FAILED_DETAIL: BucketDetailBody = {
  bucket: FAILED_BUCKET,
  songs: [],
};

// ────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────

async function setMobileViewport(page: Page): Promise<void> {
  await page.setViewportSize({ width: 375, height: 667 });
}

async function mockDetail(page: Page, body: BucketDetailBody): Promise<void> {
  await mockJsonRoute(page, /\/api\/me\/taste\/buckets\//, BucketDetailResponse, body);
}

async function silencePlayer(page: Page): Promise<void> {
  // The bucket-detail page issues /play/resolve + /play/started when a
  // row is tapped. We don't exercise the audio engine here; stub them
  // out so no real network failure shows in the test.
  await page.route(/\/api\/play\/resolve/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        source: "soundcloud",
        sourceTrackId: "test-track",
        streamUrl: "https://example.test/stream.m3u8",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      }),
    }),
  );
  await page.route(/\/api\/play\/started/, (route) => route.fulfill({ status: 204, body: "" }));
  await page.route(/\/api\/play\/completed/, (route) => route.fulfill({ status: 204, body: "" }));
}

test.describe("bucket detail UI", () => {
  test.beforeEach(async ({ page }) => {
    await setMobileViewport(page);
    await silencePlayer(page);
  });

  // ──────────────────────────────────────────────────────────────────
  // 1. Ready-populated — User behavior steps 2–3
  // ──────────────────────────────────────────────────────────────────

  test("ready-populated state pixel-locks the bucket-detail layout", async ({ page }) => {
    await mockDetail(page, READY_DETAIL);
    await page.goto(`/taste/buckets/${READY_BUCKET.id}`);

    await expect(page.getByRole("heading", { name: "Late night drives" })).toBeVisible();
    await expect(page.getByText("3 songs")).toBeVisible();
    await expect(page.getByRole("button", { name: "Play all" })).toBeVisible();

    // List order is the server-emitted order — no client re-sort.
    const titles = await page
      .getByTestId("bucket-detail-song-list")
      .locator("li")
      .allTextContents();
    expect(titles[0]).toContain("Whatever");
    expect(titles[1]).toContain("Strange brew");
    expect(titles[2]).toContain("Midnight city");

    await expect(page).toHaveScreenshot("bucket-detail-ready.png", {
      fullPage: true,
      animations: "disabled",
    });
    await expectAccessible(page);
  });

  test("back button returns to /taste via React Router", async ({ page }) => {
    await mockDetail(page, READY_DETAIL);
    // /taste mounts its own fetchers — mock the profile route so the
    // navigation lands on a stable shell.
    await mockJsonRoute(page, /\/api\/me\/taste\/profile/, TasteBucketsResponse, {
      buckets: [READY_BUCKET],
    });
    await page.goto(`/taste/buckets/${READY_BUCKET.id}`);

    await page.getByRole("button", { name: "Back to Taste" }).click();
    await expect(page).toHaveURL(/\/taste$/);
  });

  test("singular 'N song' subtitle when songs.length === 1", async ({ page }) => {
    const body: BucketDetailBody = {
      bucket: READY_BUCKET,
      songs: [READY_DETAIL.songs[0]!],
    };
    await mockDetail(page, body);
    await page.goto(`/taste/buckets/${READY_BUCKET.id}`);
    await expect(page.getByText("1 song", { exact: true })).toBeVisible();
  });

  // ──────────────────────────────────────────────────────────────────
  // 2. Building state — User behavior step 7
  // ──────────────────────────────────────────────────────────────────

  test("building state renders 'Building…' with no Play all / song list", async ({ page }) => {
    await mockDetail(page, buildingDetail());
    await page.goto(`/taste/buckets/${buildingNow().id}`);

    await expect(page.getByText("Building…")).toBeVisible();
    await expect(page.getByRole("button", { name: "Play all" })).toHaveCount(0);
    await expect(page.getByTestId("bucket-detail-song-list")).toHaveCount(0);

    await expect(page).toHaveScreenshot("bucket-detail-building.png", {
      fullPage: true,
      animations: "disabled",
    });
    await expectAccessible(page);
  });

  // ──────────────────────────────────────────────────────────────────
  // 3. Failed state — User behavior step 7
  // ──────────────────────────────────────────────────────────────────

  test("failed state renders errorReason with no Play all / song list", async ({ page }) => {
    await mockDetail(page, FAILED_DETAIL);
    await page.goto(`/taste/buckets/${FAILED_BUCKET.id}`);

    await expect(page.getByTestId("bucket-detail-failed-reason")).toHaveText(
      "Not enough signal yet — swipe a few more songs.",
    );
    await expect(page.getByRole("button", { name: "Play all" })).toHaveCount(0);
    await expect(page.getByTestId("bucket-detail-song-list")).toHaveCount(0);

    await expect(page).toHaveScreenshot("bucket-detail-failed.png", {
      fullPage: true,
      animations: "disabled",
    });
    await expectAccessible(page);
  });

  // ──────────────────────────────────────────────────────────────────
  // 4. Empty-songs ready state — UI-37 boundary
  // ──────────────────────────────────────────────────────────────────

  test("ready bucket with 0 songs hides Play all + renders empty-list caption", async ({
    page,
  }) => {
    await mockDetail(page, EMPTY_DETAIL);
    await page.goto(`/taste/buckets/${EMPTY_BUCKET.id}`);

    await expect(page.getByText("0 songs")).toBeVisible();
    await expect(page.getByRole("button", { name: "Play all" })).toHaveCount(0);
    await expect(page.getByTestId("bucket-detail-empty-list")).toHaveText("(no songs yet)");
  });

  // ──────────────────────────────────────────────────────────────────
  // 5. 404 — failure mode "bucket id not found"
  // ──────────────────────────────────────────────────────────────────

  test("404 → 'Bucket not found' + back link, page passes a11y", async ({ page }) => {
    await mockJsonError(page, /\/api\/me\/taste\/buckets\//, 404, {
      code: "not_found",
      message: "Bucket not found",
    });
    await page.goto("/taste/buckets/00000000-0000-4000-8000-00000000dead");

    await expect(page.getByRole("heading", { name: "Bucket not found" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Back to Taste" })).toBeVisible();

    await expectAccessible(page);
  });

  // ──────────────────────────────────────────────────────────────────
  // 6. Server error — failure mode "couldn't load this bucket"
  // ──────────────────────────────────────────────────────────────────

  test("5xx renders 'Try again'; clicking it re-fetches successfully", async ({ page }) => {
    let calls = 0;
    await page.route(/\/api\/me\/taste\/buckets\//, async (route) => {
      calls += 1;
      if (calls === 1) {
        await route.fulfill({
          status: 502,
          contentType: "application/json",
          body: JSON.stringify({
            error: { code: "internal_error", message: "Boom" },
          }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(BucketDetailResponse.parse(READY_DETAIL)),
      });
    });
    await page.goto(`/taste/buckets/${READY_BUCKET.id}`);
    await expect(page.getByText("Couldn't load this bucket.")).toBeVisible();
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByRole("heading", { name: "Late night drives" })).toBeVisible();
  });

  // ──────────────────────────────────────────────────────────────────
  // 7. Row tap → POST /play/started with bucket origin (UI-38)
  // ──────────────────────────────────────────────────────────────────

  test("tapping a row POSTs /play/started with bucketId + bucketKind", async ({ page }) => {
    await mockDetail(page, READY_DETAIL);
    const startedBodies: unknown[] = [];
    await page.route(/\/api\/play\/started/, async (route) => {
      const body = route.request().postDataJSON();
      startedBodies.push(body);
      await route.fulfill({ status: 204, body: "" });
    });

    await page.goto(`/taste/buckets/${READY_BUCKET.id}`);
    await page.getByRole("button", { name: /Play Whatever by The Strokes/ }).click();

    // Give the play-started request a tick to fire.
    await expect.poll(() => startedBodies.length).toBeGreaterThan(0);
    const body = startedBodies[0] as {
      bucketId?: string;
      bucketKind?: string;
      source?: string;
      externalId?: string;
    };
    expect(body.bucketId).toBe(READY_BUCKET.id);
    expect(body.bucketKind).toBe("auto");
    expect(body.source).toBe("soundcloud");
    expect(body.externalId).toBe("track-1");
  });

  // ──────────────────────────────────────────────────────────────────
  // 8. Play all → first POST /play/started carries bucket origin
  // ──────────────────────────────────────────────────────────────────

  test("Play all kicks the first row with bucketId + bucketKind on the started body", async ({
    page,
  }) => {
    await mockDetail(page, READY_DETAIL);
    const startedBodies: unknown[] = [];
    await page.route(/\/api\/play\/started/, async (route) => {
      startedBodies.push(route.request().postDataJSON());
      await route.fulfill({ status: 204, body: "" });
    });

    await page.goto(`/taste/buckets/${READY_BUCKET.id}`);
    await page.getByRole("button", { name: "Play all" }).click();

    await expect.poll(() => startedBodies.length).toBeGreaterThan(0);
    const body = startedBodies[0] as {
      bucketId?: string;
      bucketKind?: string;
      externalId?: string;
    };
    expect(body.bucketId).toBe(READY_BUCKET.id);
    expect(body.bucketKind).toBe("auto");
    // First song in server order is `track-1`.
    expect(body.externalId).toBe("track-1");
  });

  // ──────────────────────────────────────────────────────────────────
  // 9. Touch-target sizes (BROWSER-08)
  // ──────────────────────────────────────────────────────────────────

  test("back affordance and Play all both satisfy the 44×44 px minimum", async ({ page }) => {
    await mockDetail(page, READY_DETAIL);
    await page.goto(`/taste/buckets/${READY_BUCKET.id}`);

    const backBox = await page.getByRole("button", { name: "Back to Taste" }).boundingBox();
    expect(backBox).not.toBeNull();
    expect(backBox!.width).toBeGreaterThanOrEqual(44);
    expect(backBox!.height).toBeGreaterThanOrEqual(44);

    const playBox = await page.getByRole("button", { name: "Play all" }).boundingBox();
    expect(playBox).not.toBeNull();
    expect(playBox!.width).toBeGreaterThanOrEqual(44);
    expect(playBox!.height).toBeGreaterThanOrEqual(44);
  });

  // ──────────────────────────────────────────────────────────────────
  // 10. Navigation from a ready bucket card on /taste
  // ──────────────────────────────────────────────────────────────────

  test("tapping a ready bucket card on /taste navigates to its detail page", async ({ page }) => {
    await mockJsonRoute(page, /\/api\/me\/taste\/profile/, TasteBucketsResponse, {
      buckets: [READY_BUCKET],
    });
    await mockDetail(page, READY_DETAIL);

    await page.goto("/taste");
    await page.getByRole("button", { name: `Open bucket ${READY_BUCKET.name}` }).click();

    await expect(page).toHaveURL(new RegExp(`/taste/buckets/${READY_BUCKET.id}$`));
    await expect(page.getByRole("heading", { name: READY_BUCKET.name })).toBeVisible();
  });
});
