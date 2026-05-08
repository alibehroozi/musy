---
description: Implement a new feature end-to-end with TDD discipline
---

# Implement a new feature

The user describes a feature they want built. Your job is to take it from description to "PR open and verified" with the invariant-first workflow.

The user can describe the feature in two ways:

- **Free-form** in chat (e.g. "add a sign-in flow with Google").
- **Pointing at a product-spec feature file** (e.g. "implement `product-specs/auth/features/01-sign-in-google.md`"). When this happens, that file IS the spec — read it whole and use it as the input to every subsequent step:
  - "Product description" → the feature description for the rest of this command
  - "Suggested invariants" → seeds for `/new-invariant`'s exploration
  - "DS components used / missing" → answers step 3 directly
  - "Tooling" → answers step 2 directly
  - "Acceptance criteria" → manual-exercise checklist before opening the PR
  - When done, set the file's frontmatter `status: done` and add `implemented-in-pr: <url>`. Don't delete it — it's historical record.

## Sequence (do in order, do not skip)

1. **Confirm the scope.** Restate the feature in one sentence and confirm with the user. If a product-spec file was passed, restate from its "Product description". If it's bigger than a single PR, propose a split before proceeding. Don't push past ambiguous scope.

2. **Tooling check (terse).** Before branching:
   - List capabilities this feature needs that the codebase doesn't already cover (auth? email? rate-limit? embeddings? caching? scheduling?)
   - For each new capability: 2–3 **open-source** candidates + your recommendation. **One short reason each. Bullet list only. No paragraphs.**
   - Open-source first; propose paid/proprietary only when open-source options are clearly worse — and say why
   - "No new packages — using `<existing>`" is a valid output and the most common one
   - **Stop and wait for user approval** before adding any dep

   Example output shape:

   ```
   - magic-link tokens: lucia (recommended — TS-native, small) | passport-magic-login | roll-own
   - email send: nodemailer (recommended — std, ESM-friendly) | resend SDK | postmark SDK
   Approve?
   ```

3. **Design system check (web features only).** Read [`DESIGN.md`](../../DESIGN.md). For each UI element this feature needs (button, tooltip, input, modal, …), check the catalog. If anything is missing:
   - Stop and tell the user: _"`<Component>` is identified as a design-system component and is missing from the catalog. Add it to the design system first?"_
   - On approval, run `/design-system` to land the missing piece(s) as their own commits **before** continuing this command. Each missing component becomes its own `feat(design-system, <name>): …` commit.
   - On rejection, you must surface why a one-off in `apps/web/` is acceptable here. Default is to add to the DS — one-off UI inside `apps/web/` is the smell, not the shortcut.
   - Skip this step entirely for backend-only features.

4. **Branch.** `git checkout -b task-<slug>` (e.g. `task-magic-link-login`).

5. **Define invariants FIRST.** Run `/new-invariant`. That command runs explore → suggest → write and stops at red stubs. Confirm `npm run test:invariants` shows the new tests as `todo` or failing — if they pass, the stubs are wrong.

6. **Re-read `ARCHITECTURE.md`** for the section(s) relevant to where you're about to write code (apps/api, apps/web, the relevant lib). The implementation must conform — controller/service/repository layering on the api side, component sizing / hook / context rules on the web side, allowed-deps boundary on libs.

7. **Implement libs-first, one commit per layer.** Per AGENTS.md hard rule #10, each layer that's touched is its own commit. Empty layers are skipped.

   Order, with conventional commit message prefix in parens:
   - **`feat(contracts): ...`** — Zod schemas in `libs/shared/contracts/`. Both BE and FE will import these.
   - **`feat(api-core): ...`** — pure backend logic in `libs/api/core/` (validators, transformers). No NestJS / Mongoose imports.
   - **`feat(web-core): ...`** — pure frontend logic in `libs/web/core/`. No React / DOM imports.
   - **`feat(api): ...`** — `apps/api/src/modules/<name>/` with module + controller + service + repository + schema. Per `ARCHITECTURE.md` layering.
   - **`feat(web): ...`** — `apps/web/src/features/<name>/` with `<Name>Page.tsx`, subcomponents in `components/`, hooks in `hooks/`, fetcher in `api.ts`. Components used must already exist in `@moc/design-system` (caught by step 3).
   - **`test(visual, web): user-flow spec for <feature>`** — when the feature touches UI: a Playwright spec at `apps/web/tests/e2e/<feature-slug>.spec.ts` that replicates the user behavior described in the product-spec feature file. See step 7a below for the mapping. **Only present when web UI changes; backend-only features skip.**

   **Convert `it.todo` test bodies into real assertions in the same commit as the layer that makes them passable.** Tests that depend on `contracts` get real bodies in the `feat(contracts):` commit. Tests that depend on `api` get real bodies in the `feat(api):` commit. By the final code commit, every test is green.

7a. **Authoring the Playwright spec (when step 7 includes a `test(visual, web):` commit).** The product-spec feature file's **User behavior** section IS the test plan. Map directly:

- **Each numbered step where the UI visibly changes** → a `toHaveScreenshot('<feature>-<state>.png')` after the corresponding interaction.
- **Each named "Failure mode the user can reach"** → its own `test()` that forces that state (e.g. `page.route('**/api/...', r => r.abort())` for network failure) and snaps the resulting UI.
- **Empty / first-run state** → its own `test()` snapping the page before any user input.

Rules:

- **Always import from `./fixtures.js`, never directly from `@playwright/test`.** The shared fixture mocks auth universally — every test starts authenticated as `TEST_USER` (a stable fake account) so feature tests focus on the feature's behavior, not the sign-in dance. To test unauthenticated UX, override per `test.describe` with `test.use({ authed: false })`.
- **Mocked responses MUST be typed against `@moc/contracts` Zod schemas.** Use the `mockJsonRoute(page, urlGlob, schema, body, status?)` helper from `./fixtures.js` — it (1) parses `body` against `schema` at mock-write time so a typo surfaces as a clear Zod error instead of a confusing test failure later, and (2) keeps the mock shape locked to the wire format the API actually emits. For error responses, use `mockJsonError(page, urlGlob, status, error)` which builds an `ErrorResponse`-shaped body. **Never use bare `page.route(..., r => r.fulfill({ body: JSON.stringify({...}) }))`** with an untyped object literal — that's how mocks drift from the contract and tests pass against shapes the real API will never return.
- The auth fixture only mocks `/api/me`. Feature-specific endpoints (search, history, taste profile, …) are the test's responsibility — mock them via `mockJsonRoute` inside each test or in a `test.beforeEach`. For genuine network failures (not HTTP errors), `page.route('**/api/...', r => r.abort())` is still correct — there's no body to type.
- **Every `toHaveScreenshot(...)` is paired with `await expectAccessible(page)`** (per AGENTS.md hard rule #13). The a11y check fails the test on any contrast violation, missing label, invalid ARIA, etc. against WCAG AA. A failure on token-driven UI means the token pair is wrong — fix `theme.css` in `@moc/design-system`, not the test.
- **No raw `<button>` / `<input>` / `<textarea>` / `<select>` in `apps/web/`** (AGENTS.md hard rule #14, enforced by ESLint). Use the matching `@moc/design-system` component. If the DS equivalent doesn't exist yet, that's a `/design-system` task first.
- Use accessible selectors only (`page.getByRole`, `page.getByLabel`, `page.getByText`). **Never CSS selectors** — they couple the test to implementation, not behavior.
- One spec file per feature (`apps/web/tests/e2e/<feature-slug>.spec.ts`), one `test.describe` block per feature.
- Wait on observable state (`expect(page.getByText(...)).toBeVisible()`), not timers (`page.waitForTimeout`).
- Snapshot fullPage only when layout matters end-to-end; prefer scoped element snapshots (`expect(page.getByRole('main')).toHaveScreenshot(...)`) when a header / nav is irrelevant to the feature.

Pattern (note the imports — `./fixtures.js` and the contract schemas, not `@playwright/test` and ad-hoc objects):

```ts
import { test, expect, mockJsonRoute, mockJsonError, expectAccessible } from "./fixtures.js";
import { SearchResponse } from "@moc/contracts";

test.describe("search", () => {
  // Mock the feature's own API. Auth (/api/me) is already mocked by the
  // fixture since `authed` defaults to true. The body literal is typed
  // against SearchResponse and parsed at mock-write time — a typo here
  // throws ZodError immediately instead of surfacing later as a UI bug.
  test.beforeEach(async ({ page }) => {
    await mockJsonRoute(page, "**/api/search**", SearchResponse, {
      results: [
        {
          type: "track",
          id: "1",
          title: "Hey Jude",
          artist: "The Beatles",
          provider: "deezer",
          providerId: "deezer-1",
          sources: ["deezer"],
        },
      ],
      partial: false,
      failedProviders: [],
      cached: false,
    });
  });

  test("empty state — initial visit", async ({ page }) => {
    await page.goto("/search");
    await expect(page).toHaveScreenshot("search-empty.png");
    await expectAccessible(page);
  });

  test("typing query and seeing results", async ({ page }) => {
    await page.goto("/search");
    await page.getByRole("searchbox").fill("the beatles");
    await page.getByRole("searchbox").press("Enter");
    await expect(page.getByText(/Hey Jude/)).toBeVisible();
    await expect(page).toHaveScreenshot("search-results.png");
    await expectAccessible(page);
  });

  test("upstream provider error — surfaces in toast", async ({ page }) => {
    // ErrorResponse-shaped 502; mockJsonError handles the schema part.
    await mockJsonError(page, "**/api/search**", 502, {
      code: "UPSTREAM_ERROR",
      message: "Provider timed out",
    });
    await page.goto("/search");
    await page.getByRole("searchbox").fill("anything");
    await page.getByRole("searchbox").press("Enter");
    await expect(page.getByRole("status")).toContainText(/error/i);
    await expect(page).toHaveScreenshot("search-error.png");
    await expectAccessible(page);
  });

  test("genuine network failure — offline indicator", async ({ page }) => {
    // route.abort is fine here — no body to type.
    await page.route("**/api/search**", (r) => r.abort());
    await page.goto("/search");
    await page.getByRole("searchbox").fill("anything");
    await page.getByRole("searchbox").press("Enter");
    await expect(page.getByRole("status")).toContainText(/offline/i);
    await expect(page).toHaveScreenshot("search-offline.png");
    await expectAccessible(page);
  });

  // Unauthenticated variant — opt out of the default auth mock.
  test.describe("not signed in", () => {
    test.use({ authed: false });

    test("redirects to sign-in", async ({ page }) => {
      await page.goto("/search");
      await expect(page).toHaveScreenshot("search-signin.png");
    });
  });
});
```

First run will fail (no baselines). On the first commit that adds the spec, run `npm run test:visual:web:update` and commit the resulting PNGs as part of the same `test(visual, web):` commit (so the PR shows the new spec + its baselines together).

8. **Run verify** after each layer commit. `npm run verify` doesn't have to pass on every intermediate commit (test commits often run red against missing implementation), but **the final commit on the branch must be green**.

9. **Manually exercise.** For UI/API features:
   - `npm run db:up && npm run dev`
   - Use the feature in the browser / via curl
   - Confirm Mongo Express (http://localhost:8181) shows the expected docs

10. **Cascade env / local-dev changes (per AGENTS.md hard rule #9).** Did this feature add, rename, change the meaning of, or remove an environment variable? Add a docker service / port / system dep / init step? If yes, the change ripples to **all four** of:
    - `apps/<api|web>/.env.example` — add / rename / remove the line, one-line comment per key
    - `.claude/commands/prepare-local.md` — Step 3 (owned-keys list, fresh-write template, validation list, status summary), Step 4 / Step 5 if a service / port / URL changed
    - `.github/workflows/auto-feature.yml` — the "Seed CI .env.local files" heredoc
    - `.github/workflows/claude-respond.yml` — same seed step (mirror)

    Land them in one `chore(setup): cascade <var-or-thing> across env files + workflows` commit (or split per-file if the change is large). **Forgetting any one of the four breaks either local dev or CI.** If no env / local-dev change, skip this step entirely.

11. **Mark the product-spec feature file done (if applicable).** If this run consumed a `product-specs/<epic>/features/NN-<slug>.md`, edit its frontmatter — set `status: done` and add `implemented-in-pr: <PR url>` — and commit as `docs(epic, <epic-slug>): mark NN-<slug> done`. Don't delete the file; it's historical record. If all features in the epic are done, also flip `EPIC.md`'s `status:` to `done` in the same commit.

12. **Open PR** against `main` with title `task: <short title>`. Body lists:

- The commit sequence (spec → test → code by layer)
- The new invariant IDs
- Confirmation final commit is `npm run verify` green

## Hard rules (re-stated from AGENTS.md)

- **Micro-commits in order.** spec (via `/new-invariant` commit 1) → test stubs (via `/new-invariant` commit 2) → implementation by layer. Never bundle layers; never bundle test+code in the same commit unless they're truly inseparable.
- **Conform to `ARCHITECTURE.md`.** Layering, file roles, "when to use what" — non-negotiable.
- TDD: failing tests first. If you can't make them red, the test is wrong (or the invariant is misframed — go back to `/new-invariant`).
- If a test fails during implementation, fix the **source**. Never weaken the test.
- Pure logic in libs, side effects in apps.
- No new dependencies without asking the user first.
- Never edit `.env*` files (other than `.env.example`) or `.github/workflows/*`.

## Watch out for

- **Skipping step 2 (tooling check).** Asking the user about packages mid-implementation is too late — propose options upfront, terse and bullet-listed, and wait for sign-off before adding deps.
- **Skipping step 3 (design-system check).** Hand-rolling buttons / tooltips / inputs into `apps/web/` instead of `@moc/design-system` is the most common drift. Always check the catalog first.
- **Skipping step 6 (re-read ARCHITECTURE.md).** Most architectural drift comes from agents going on muscle-memory instead of checking the project's specific layering rules.
- **Implementing before invariants.** If you find yourself writing code without a red test, stop. Go back to step 5.
- **Drive-by changes.** A feature PR touches only what the feature requires. Refactors go in their own PRs.
- **Skipping the manual exercise.** Type-checked + green tests means correct logic, not correct user experience. For UI features, click through it before calling done.
- **Adding a new invariant section.** Categories in `INVARIANTS.md` are by constraint, never by feature. If nothing fits, the invariant is mis-phrased.
- **Putting business logic in the controller, or HTTP in the service.** Re-check the layering table in `ARCHITECTURE.md` — every Nest file has exactly one role.
- **Components creeping past their size cap, or contextifying single-subtree state.** Same — re-check the React rules in `ARCHITECTURE.md`.
