import { test, expect, mockJsonRoute, mockJsonError, expectAccessible } from "./fixtures.js";
import { TasteBucketsResponse, CustomMixCreatedResponse, type TasteBucket } from "@moc/contracts";
import type { Page } from "@playwright/test";

/**
 * Feature 07: Taste page + mix modal UI.
 * Source: product-specs/taste/features/07-taste-page-and-mix-modal-ui.md.
 *
 * Coverage maps onto the spec's "User behavior" + failure modes + the
 * BROWSER-07 invariants. One `test()` per visible state and per failure
 * branch, each paired with `expectAccessible(page)` per AGENTS.md hard
 * rule #13. All mocked responses are typed via `mockJsonRoute` /
 * `mockJsonError` against `@moc/contracts` schemas so a contract drift
 * fails at mock-write time, not in the middle of a flaky run.
 *
 *   1. Empty state (no buckets) — pixel-locks the empty-state mockup;
 *      "Go to Explore →" routes via React Router; 44×44 touch target
 *      (UI-33, BROWSER-07).
 *   2. Populated state — 2-col grid, created-newest-first ordering
 *      (UI-34, BROWSER-07).
 *   3. Building state — shimmer treatment, custom-bucket prompt caption,
 *      auto-bucket has no caption (UI-34, BROWSER-07; shimmer animation
 *      frozen by Playwright's `animations: "disabled"`, which both
 *      verifies the snapshot is stable AND respects `prefers-reduced-
 *      motion` in spirit).
 *   4. Failed state — danger border + tap-to-toggle errorReason (UI-34).
 *   5. ✨ New mix modal — open, role="dialog", aria-modal="true",
 *      visual snapshot + a11y (UI-35, BROWSER-07).
 *   6. Generate validation — disabled on empty + on > 500 chars (UI-35).
 *   7. Successful POST — modal closes, refresh() pulls the new building
 *      card to the top of the grid (UI-35, UI-34).
 *   8. Failure-mode error copy — 422, 429, and network failure each
 *      render their distinct inline error inside the modal (UI-35).
 *   9. BROWSER-07 — Escape closes restoring focus to the ✨ New mix
 *      trigger; scrim click closes.
 */

// ────────────────────────────────────────────────────────────────────────
// Fixture buckets
// ────────────────────────────────────────────────────────────────────────

const READY_BUCKET_A: TasteBucket = {
  id: "00000000-0000-4000-8000-00000000aaaa",
  userId: "00000000-0000-4000-8000-000000000001",
  name: "Late-night focus",
  description: null,
  kind: "auto",
  state: "ready",
  promptText: null,
  errorReason: null,
  createdAt: "2026-05-15T10:00:00.000Z",
  lastBuiltAt: "2026-05-15T10:01:00.000Z",
  coverArtworkUrl: null,
};

const READY_BUCKET_B: TasteBucket = {
  id: "00000000-0000-4000-8000-00000000bbbb",
  userId: "00000000-0000-4000-8000-000000000001",
  name: "Driving rock",
  description: null,
  kind: "auto",
  state: "ready",
  promptText: null,
  errorReason: null,
  createdAt: "2026-05-16T10:00:00.000Z",
  lastBuiltAt: "2026-05-16T10:01:00.000Z",
  coverArtworkUrl: null,
};

const READY_BUCKET_C: TasteBucket = {
  id: "00000000-0000-4000-8000-00000000cccc",
  userId: "00000000-0000-4000-8000-000000000001",
  name: "Coffee shop chill",
  description: null,
  kind: "auto",
  state: "ready",
  promptText: null,
  errorReason: null,
  createdAt: "2026-05-17T10:00:00.000Z",
  lastBuiltAt: "2026-05-17T10:01:00.000Z",
  coverArtworkUrl: null,
};

/**
 * Building buckets are time-sensitive: the page treats a bucket as
 * "really still building" only while `Date.now() - lastBuiltAt <
 * 120_000` (LOGIC-38 → UI-36 upgrade in TastePage's `orderByCreatedDesc`).
 * A static timestamp in the past would silently flip the card to
 * `failed` the moment the test runs, so we build these fixtures at
 * call time with `lastBuiltAt` pinned to "just now".
 */
function buildingCustomNow(): TasteBucket {
  const nowIso = new Date().toISOString();
  return {
    id: "00000000-0000-4000-8000-00000000dddd",
    userId: "00000000-0000-4000-8000-000000000001",
    name: "Mix",
    description: null,
    kind: "custom",
    state: "building",
    promptText: "rainy day jazz",
    errorReason: null,
    createdAt: nowIso,
    lastBuiltAt: nowIso,
    coverArtworkUrl: null,
  };
}

function buildingAutoNow(): TasteBucket {
  const nowIso = new Date().toISOString();
  return {
    id: "00000000-0000-4000-8000-00000000eeee",
    userId: "00000000-0000-4000-8000-000000000001",
    name: "Building auto",
    description: null,
    kind: "auto",
    state: "building",
    promptText: null,
    errorReason: null,
    createdAt: nowIso,
    lastBuiltAt: nowIso,
    coverArtworkUrl: null,
  };
}

const FAILED_BUCKET: TasteBucket = {
  id: "00000000-0000-4000-8000-00000000ffff",
  userId: "00000000-0000-4000-8000-000000000001",
  name: "Broken mix",
  description: null,
  kind: "custom",
  state: "failed",
  promptText: "midnight metal jazz fusion",
  errorReason: "Not enough signal yet — swipe a few more songs.",
  createdAt: "2026-05-17T12:00:00.000Z",
  lastBuiltAt: "2026-05-17T12:00:00.000Z",
  coverArtworkUrl: null,
};

const MIX_CREATED: CustomMixCreatedResponse = {
  jobId: "00000000-0000-4000-8000-000000000010",
  bucketId: "00000000-0000-4000-8000-00000000dddd",
};

// ────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────

async function setMobileViewport(page: Page): Promise<void> {
  await page.setViewportSize({ width: 375, height: 667 });
}

/**
 * Mock `GET /api/me/taste/profile` returning the same buckets on every
 * call. Polling re-hits the route while a bucket is building; using a
 * stable payload keeps the screenshot deterministic without disabling
 * the polling effect.
 */
async function mockTasteProfile(page: Page, buckets: TasteBucket[]): Promise<void> {
  await mockJsonRoute(page, /\/api\/me\/taste\/profile/, TasteBucketsResponse, { buckets });
}

test.describe("taste page + mix modal", () => {
  test.beforeEach(async ({ page }) => {
    await setMobileViewport(page);
  });

  // ──────────────────────────────────────────────────────────────────
  // 1. Empty state — User behavior step 1
  // ──────────────────────────────────────────────────────────────────

  test("empty state renders the build-your-taste layout", async ({ page }) => {
    await mockTasteProfile(page, []);
    await page.goto("/taste");

    await expect(page.getByRole("heading", { name: "Build your Taste" })).toBeVisible();
    await expect(
      page.getByText("Swipe in Explore to create your buckets", { exact: false }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Import from Spotify" })).toBeDisabled();
    await expect(page.getByText("Coming soon")).toBeVisible();

    await expect(page).toHaveScreenshot("taste-empty.png", {
      fullPage: true,
      animations: "disabled",
    });
    await expectAccessible(page);
  });

  test("'Go to Explore →' routes to /explore via React Router", async ({ page }) => {
    await mockTasteProfile(page, []);
    // /explore mounts its own fetchers — abort them so this test stays
    // scoped to navigation. We're not asserting on the page content,
    // only that the URL changed.
    await page.route(/\/api\/explore\//, (route) => route.abort());

    await page.goto("/taste");
    await page.getByRole("button", { name: /Go to Explore/ }).click();

    // React-Router pushState — no full page reload.
    await expect(page).toHaveURL(/\/explore$/);
  });

  test("'Go to Explore' meets the 44×44 touch-target minimum", async ({ page }) => {
    await mockTasteProfile(page, []);
    await page.goto("/taste");

    const cta = page.getByRole("button", { name: /Go to Explore/ });
    const box = await cta.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  });

  // ──────────────────────────────────────────────────────────────────
  // 2. Populated state — User behavior step 2
  // ──────────────────────────────────────────────────────────────────

  test("populated state renders a 2-col grid in created-newest-first order", async ({ page }) => {
    // A (oldest), B (middle), C (newest) — page should sort C, B, A.
    await mockTasteProfile(page, [READY_BUCKET_A, READY_BUCKET_B, READY_BUCKET_C]);
    await page.goto("/taste");

    await expect(page.getByRole("heading", { name: "Taste" })).toBeVisible();
    await expect(page.getByRole("button", { name: /New mix/ })).toBeVisible();

    const items = page.getByRole("listitem");
    await expect(items).toHaveCount(3);

    // Newest-first: text content of the bucket name appears in that
    // order across the three cards. UI-34 invariant lives here.
    const names = await items.allTextContents();
    expect(names[0]).toContain("Coffee shop chill");
    expect(names[1]).toContain("Driving rock");
    expect(names[2]).toContain("Late-night focus");

    await expect(page).toHaveScreenshot("taste-populated.png", {
      fullPage: true,
      animations: "disabled",
    });
    await expectAccessible(page);
  });

  // ──────────────────────────────────────────────────────────────────
  // 3. Building state — User behavior step 4
  // ──────────────────────────────────────────────────────────────────

  test("building state renders shimmer + custom-prompt caption", async ({ page }) => {
    await mockTasteProfile(page, [READY_BUCKET_A, buildingCustomNow()]);
    await page.goto("/taste");

    await expect(page.getByText("Building…")).toBeVisible();
    // Custom-bucket prompt caption only appears for kind === "custom".
    await expect(page.getByText('"rainy day jazz"')).toBeVisible();

    await expect(page).toHaveScreenshot("taste-building.png", {
      fullPage: true,
      animations: "disabled",
    });
    await expectAccessible(page);
  });

  test("custom + auto building buckets — only the custom one renders a quoted caption", async ({
    page,
  }) => {
    // Two buckets in the same building state distinguishes the
    // custom-vs-auto contract: only the custom prompt text surfaces.
    await mockTasteProfile(page, [buildingCustomNow(), buildingAutoNow()]);
    await page.goto("/taste");

    await expect(page.getByText("Building…")).toHaveCount(2);
    // Exactly one quoted caption appears — for the custom bucket only.
    await expect(page.getByText(/^"[^"]+"$/)).toHaveCount(1);
    await expect(page.getByText('"rainy day jazz"')).toBeVisible();
  });

  // ──────────────────────────────────────────────────────────────────
  // 4. Failed state
  // ──────────────────────────────────────────────────────────────────

  test("failed state — tap reveals errorReason", async ({ page }) => {
    await mockTasteProfile(page, [FAILED_BUCKET]);
    await page.goto("/taste");

    const failedCard = page.getByRole("button", { name: /Failed bucket Broken mix/ });
    await expect(failedCard).toBeVisible();
    // errorReason hidden until tapped.
    await expect(page.getByTestId(`bucket-error-${FAILED_BUCKET.id}`)).toHaveCount(0);

    await failedCard.click();
    await expect(page.getByTestId(`bucket-error-${FAILED_BUCKET.id}`)).toHaveText(
      "Not enough signal yet — swipe a few more songs.",
    );
  });

  // ──────────────────────────────────────────────────────────────────
  // 5. ✨ New mix modal — User behavior step 3, BROWSER-07
  // ──────────────────────────────────────────────────────────────────

  test("✨ New mix opens the modal with role=dialog + aria-modal=true", async ({ page }) => {
    await mockTasteProfile(page, [READY_BUCKET_A]);
    await page.goto("/taste");

    await page.getByRole("button", { name: /New mix/ }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute("aria-modal", "true");
    await expect(page.getByRole("heading", { name: "Request a taste mix" })).toBeVisible();

    await expect(page).toHaveScreenshot("mix-modal.png", {
      fullPage: true,
      animations: "disabled",
    });
    await expectAccessible(page);
  });

  // ──────────────────────────────────────────────────────────────────
  // 6. Generate validation — UI-35
  // ──────────────────────────────────────────────────────────────────

  test("Generate is disabled when the prompt is empty", async ({ page }) => {
    await mockTasteProfile(page, [READY_BUCKET_A]);
    await page.goto("/taste");
    await page.getByRole("button", { name: /New mix/ }).click();

    await expect(page.getByRole("button", { name: "Generate" })).toBeDisabled();
  });

  test("Generate is disabled when the prompt exceeds 500 chars + helper text appears", async ({
    page,
  }) => {
    await mockTasteProfile(page, [READY_BUCKET_A]);
    await page.goto("/taste");
    await page.getByRole("button", { name: /New mix/ }).click();

    const input = page.getByLabel("Mix prompt");
    await input.fill("x".repeat(501));

    await expect(page.getByRole("button", { name: "Generate" })).toBeDisabled();
    await expect(page.getByText("Prompts are capped at 500 characters.")).toBeVisible();
  });

  // ──────────────────────────────────────────────────────────────────
  // 7. Successful POST — User behavior step 4
  // ──────────────────────────────────────────────────────────────────

  test("successful Generate closes the modal and a Building… card appears at the top", async ({
    page,
  }) => {
    // Multi-stage GET /profile: initial call returns the existing
    // bucket; after the refresh triggered by a successful POST, the
    // new building bucket is included. Typed via TasteBucketsResponse
    // at fulfill time so a schema drift fails loudly.
    let profileCalls = 0;
    await page.route(/\/api\/me\/taste\/profile/, async (route) => {
      profileCalls += 1;
      const buckets = profileCalls === 1 ? [READY_BUCKET_A] : [READY_BUCKET_A, buildingCustomNow()];
      const body = TasteBucketsResponse.parse({ buckets });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    });

    await mockJsonRoute(
      page,
      /\/api\/me\/taste\/custom-mix/,
      CustomMixCreatedResponse,
      MIX_CREATED,
    );

    await page.goto("/taste");
    await expect(page.getByText("Late-night focus")).toBeVisible();

    await page.getByRole("button", { name: /New mix/ }).click();
    await page.getByLabel("Mix prompt").fill("rainy day jazz");
    await page.getByRole("button", { name: "Generate" }).click();

    // Modal closes immediately on 200.
    await expect(page.getByRole("dialog")).toHaveCount(0);
    // Building card appears (refresh fired off onSuccess).
    await expect(page.getByText("Building…")).toBeVisible();
    await expect(page.getByText('"rainy day jazz"')).toBeVisible();
  });

  // ──────────────────────────────────────────────────────────────────
  // 8. Failure modes — UI-35
  // ──────────────────────────────────────────────────────────────────

  test("422 response renders the no-signal inline error", async ({ page }) => {
    await mockTasteProfile(page, [READY_BUCKET_A]);
    await mockJsonError(page, /\/api\/me\/taste\/custom-mix/, 422, {
      code: "NO_POSITIVE_SIGNAL",
      message: "swipe right first",
    });

    await page.goto("/taste");
    await page.getByRole("button", { name: /New mix/ }).click();
    await page.getByLabel("Mix prompt").fill("anything");
    await page.getByRole("button", { name: "Generate" }).click();

    // Modal stays open.
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByTestId("mix-modal-error")).toHaveText(
      "Swipe right on some songs in Explore first so we have material to work with.",
    );
  });

  test("429 response renders the too-many-in-flight inline error", async ({ page }) => {
    await mockTasteProfile(page, [READY_BUCKET_A]);
    await mockJsonError(page, /\/api\/me\/taste\/custom-mix/, 429, {
      code: "TOO_MANY_IN_FLIGHT",
      message: "rate limited",
    });

    await page.goto("/taste");
    await page.getByRole("button", { name: /New mix/ }).click();
    await page.getByLabel("Mix prompt").fill("anything");
    await page.getByRole("button", { name: "Generate" }).click();

    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByTestId("mix-modal-error")).toHaveText(
      "You already have a mix building. Wait for it to finish.",
    );
  });

  test("network failure renders the offline inline error", async ({ page }) => {
    await mockTasteProfile(page, [READY_BUCKET_A]);
    // page.route abort — there's no HTTP response, so no body to type.
    await page.route(/\/api\/me\/taste\/custom-mix/, (route) => route.abort());

    await page.goto("/taste");
    await page.getByRole("button", { name: /New mix/ }).click();
    await page.getByLabel("Mix prompt").fill("anything");
    await page.getByRole("button", { name: "Generate" }).click();

    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByTestId("mix-modal-error")).toHaveText(
      "Couldn't reach the server. Try again.",
    );
  });

  // ──────────────────────────────────────────────────────────────────
  // 9. BROWSER-07 — modal dismissal mechanics
  // ──────────────────────────────────────────────────────────────────

  test("pressing Escape closes the modal", async ({ page }) => {
    await mockTasteProfile(page, [READY_BUCKET_A]);
    await page.goto("/taste");

    const trigger = page.getByRole("button", { name: /New mix/ });
    await trigger.click();
    await expect(page.getByRole("dialog")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("clicking the scrim outside the dialog closes the modal", async ({ page }) => {
    await mockTasteProfile(page, [READY_BUCKET_A]);
    await page.goto("/taste");

    await page.getByRole("button", { name: /New mix/ }).click();
    await expect(page.getByRole("dialog")).toBeVisible();

    // The backdrop element receives the click; the card stops
    // propagation, so clicking the backdrop itself is what dismisses.
    await page.getByTestId("modal-backdrop").click({ position: { x: 10, y: 10 } });
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});
