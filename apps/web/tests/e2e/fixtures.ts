import { test as base, expect } from "@playwright/test";

/**
 * Universal Playwright fixtures for the music app.
 *
 * Auth is mocked by default — every test starts as `TEST_USER`, with
 * `/api/me` responding 200 + the user payload. This lets feature tests
 * focus on the feature's user behavior, not the sign-in dance.
 *
 * Specs MUST import from this file, never directly from
 * `@playwright/test`. ARCHITECTURE.md and the slash commands enforce
 * the rule; ESLint can catch it later if it slips.
 *
 * To test unauthenticated UX (sign-in page, redirects, gates), set the
 * `authed` option to `false` for that test or describe block:
 *
 *     test.describe("sign-in flow", () => {
 *       test.use({ authed: false });
 *       test("redirects to /signin", async ({ page }) => { ... });
 *     });
 *
 * `TEST_USER` values are stable so snapshots referencing the user's
 * email or id are deterministic. The user does NOT exist in Mongo —
 * the mock short-circuits before the API ever sees the request. If a
 * test exercises an endpoint that reads the user from Mongo (rare in
 * Layer 2, common in integration tests), mock that endpoint too with
 * `page.route(...)` inside the test or a `beforeEach`.
 */

export const TEST_USER = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "test@musy.dev",
  createdAt: "2026-01-01T00:00:00.000Z",
};

const UNAUTH_BODY = {
  error: { code: "UNAUTHENTICATED", message: "Not signed in" },
};

interface AuthFixtures {
  /** Whether the test starts authenticated. Default: true. */
  authed: boolean;
}

export const test = base.extend<AuthFixtures>({
  authed: [true, { option: true }],

  page: async ({ page, authed }, use) => {
    await page.route("**/api/me", async (route) => {
      if (authed) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(TEST_USER),
        });
      } else {
        await route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify(UNAUTH_BODY),
        });
      }
    });
    await use(page);
  },
});

export { expect };
