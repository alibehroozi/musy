import { test as base, expect, type Page } from "@playwright/test";
import type { ZodType } from "zod";
import { ErrorResponse, User } from "@moc/contracts";

/**
 * Universal Playwright fixtures for the music app.
 *
 * Two responsibilities:
 *
 *   1. **Auth** — every test starts authenticated as `TEST_USER`. `/api/auth/me`
 *      is intercepted to return 200 + the user payload by default. Test
 *      unauthenticated UX with `test.use({ authed: false })` per
 *      describe block.
 *
 *   2. **Typed mock helpers** — `mockJsonRoute` / `mockJsonError` build
 *      route fulfillments from `@moc/contracts` Zod schemas. Schema-
 *      backed mocks fail loudly (ZodError at mock-write time) when the
 *      contract changes, instead of producing confusing test failures
 *      against stale shapes. ARCHITECTURE.md and the slash commands
 *      forbid bare `r.fulfill({ body: JSON.stringify(...) })` on JSON
 *      responses for exactly this reason.
 *
 * Specs MUST import from this file, never directly from
 * `@playwright/test`. The fixture only mocks `/api/auth/me`; feature-
 * specific endpoints (search, history, taste, …) stay the test's
 * responsibility — mock them via `mockJsonRoute` in `beforeEach` or
 * per-test.
 */

// ────────────────────────────────────────────────────────────────────────
// Test user
// ────────────────────────────────────────────────────────────────────────

/**
 * Stable fake user. Validated against the `User` schema at module load
 * so a contract change (e.g. a new required field) breaks the test
 * suite at startup, not in the middle of a feature run.
 *
 * Does NOT exist in Mongo — the auth route mock short-circuits before
 * any real backend call. Tests that exercise endpoints that read the
 * user from Mongo must mock those too.
 */
export const TEST_USER: User = User.parse({
  id: "00000000-0000-4000-8000-000000000001",
  email: "test@musy.dev",
  googleId: "google-test-000000000000",
  createdAt: "2026-01-01T00:00:00.000Z",
});

const UNAUTH_BODY: ErrorResponse = ErrorResponse.parse({
  error: { code: "UNAUTHENTICATED", message: "Not signed in" },
});

// ────────────────────────────────────────────────────────────────────────
// Typed mock helpers
// ────────────────────────────────────────────────────────────────────────

/**
 * Mock a JSON route with a body validated against a Zod schema from
 * `@moc/contracts`. The body is parsed before fulfilling; a shape
 * mismatch throws ZodError synchronously, surfacing the typo at
 * mock-write time.
 *
 * Use this for ALL successful (2xx) JSON responses. For error
 * responses, prefer `mockJsonError` which builds an ErrorResponse-
 * shaped body. For genuine network failure (no HTTP response at all),
 * use `page.route(..., r => r.abort())` — there's no body to type.
 *
 * @example
 *   import { SearchResponse } from "@moc/contracts";
 *   await mockJsonRoute(page, "**\/api/search**", SearchResponse, {
 *     results: [...],
 *     partial: false,
 *     failedProviders: [],
 *     cached: false,
 *   });
 */
export async function mockJsonRoute<T>(
  page: Page,
  url: string | RegExp,
  schema: ZodType<T>,
  body: T,
  status = 200,
): Promise<void> {
  schema.parse(body);
  await page.route(url, (route) =>
    route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    }),
  );
}

/**
 * Mock a JSON error response shaped as `@moc/contracts` ErrorResponse.
 * Same shape `AllExceptionsFilter` emits in prod, so tests exercise
 * the same error rendering path the real backend produces.
 *
 * @example
 *   await mockJsonError(page, "**\/api/search**", 502, {
 *     code: "UPSTREAM_ERROR",
 *     message: "Provider timed out",
 *   });
 */
export async function mockJsonError(
  page: Page,
  url: string | RegExp,
  status: number,
  error: ErrorResponse["error"],
): Promise<void> {
  await mockJsonRoute(page, url, ErrorResponse, { error }, status);
}

// ────────────────────────────────────────────────────────────────────────
// Test fixture
// ────────────────────────────────────────────────────────────────────────

interface AuthFixtures {
  /** Whether the test starts authenticated. Default: true. */
  authed: boolean;
}

export const test = base.extend<AuthFixtures>({
  authed: [true, { option: true }],

  page: async ({ page, authed }, use) => {
    await page.route("**/api/auth/me", async (route) => {
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
