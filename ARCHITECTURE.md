# Architecture

This is the **operational** architecture reference. `AGENTS.md` says what rules apply globally; this file says how each workspace package is laid out, what each layer does, and when to reach for which NestJS or React tool.

> **Every new implementation and every fix must conform to this document.** If a constraint here doesn't fit a real situation, raise it as a question before silently bypassing.

---

## Core principle

**Pure logic in `libs/`, side effects in `apps/`. Layered, not entangled.**

A function that does pure data transformation belongs in `libs/api/core/` or `libs/web/core/` — even if its only caller is one Nest service or one React feature. The cost of moving it is one import; the value is testability without spinning up a container or a DOM.

---

## Workspace map

| Path                      | Role                                                                          | Allowed dependencies                                                           |
| ------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `apps/api/`               | NestJS HTTP service. Side effects: HTTP, Mongo, AI provider calls, logging    | NestJS, Mongoose, `@moc/contracts`, `@moc/api-core`, provider SDKs             |
| `apps/web/`               | React PWA. Side effects: DOM, fetch, Service Worker, browser storage          | React, Vite, Tailwind, `@moc/contracts`, `@moc/web-core`, `@moc/design-system` |
| `libs/shared/contracts/`  | Zod schemas shared FE↔BE                                                      | Zod only                                                                       |
| `libs/api/core/`          | Pure backend logic                                                            | `@moc/contracts` only — **no NestJS, no Mongoose, no I/O**                     |
| `libs/web/core/`          | Pure frontend logic                                                           | `@moc/contracts` only — **no React, no DOM, no JSX**                           |
| `libs/web/design-system/` | Visual design system: tokens (CSS vars via Tailwind v4 `@theme`) + components | React, Tailwind. **No app imports.** Shipped as `@moc/design-system`.          |

If a lib reaches for something outside its allowed deps, the feature is in the wrong place. Move it.

---

## apps/api — NestJS

### Folder structure

```
apps/api/src/
├── main.ts                    # Bootstrap: ConfigService, CORS, listen
├── app.module.ts              # Top-level module — composes feature modules
├── health.controller.ts       # Liveness/readiness — kept here, no module
├── common/                    # Cross-cutting infra
│   ├── all-exceptions.filter.ts
│   ├── public.decorator.ts
│   └── auth.guard.ts          # Global default — opt out via @Public()
└── modules/
    └── <domain>/              # One feature module per bounded context
        ├── <domain>.module.ts
        ├── <domain>.controller.ts
        ├── <domain>.service.ts
        ├── <domain>.repository.ts
        ├── <domain>.schema.ts
        └── <domain>.guard.ts  # Optional, only for ownership-scoped routes
```

**One module per bounded context** — `users/`, `auth/`, `taste/`, `recommendations/`. A feature that spans two domains gets its own module that imports from both, rather than cramming logic into one or the other.

### File roles — strict layering

Each layer talks to the layer directly below. Skipping layers is a smell.

| File                     | Knows about                                            | Never knows about                     |
| ------------------------ | ------------------------------------------------------ | ------------------------------------- |
| `<domain>.controller.ts` | HTTP, request body shape, response shape, auth context | Mongoose, business rules              |
| `<domain>.service.ts`    | Orchestration, business rules, calls to other services | HTTP, query syntax, request objects   |
| `<domain>.repository.ts` | Mongoose queries, indexes, transactions                | HTTP, business rules, request objects |
| `<domain>.schema.ts`     | Mongoose document shape                                | HTTP, business rules                  |

The controller calls the service. The service calls the repository (and `@moc/api-core` for pure logic). The repository talks to Mongoose. **Don't inject the repository directly into the controller.** The service exists to keep HTTP concerns out of data access.

### When to reach for what

| Need                               | Reach for                                                                              | Don't reach for                                           |
| ---------------------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Validate request body              | `nestjs-zod` `ZodValidationPipe` with a `@moc/contracts` schema                        | hand-rolled DTO classes, `class-validator`                |
| Authenticate the caller            | Global `AuthGuard`; routes opt out via `@Public()`                                     | Express middleware (use Nest DI)                          |
| Authorize resource access          | Per-domain `OwnerGuard` checking `req.user.id` against the doc's `userId`              | inline `if (req.user.id !== doc.userId)` in the service   |
| Map thrown error to HTTP response  | The single global `AllExceptionsFilter` returning the shared `ErrorResponse` Zod shape | `try/catch` returning `res.status(...)` in the controller |
| Cross-cutting log/timing           | An interceptor — only if a feature actually needs it                                   | sprinkled `console.log`                                   |
| Pure data transform                | A function in `@moc/api-core`                                                          | a method on a service                                     |
| One-off helper used in one service | A private method on the service                                                        | a new file or a new lib                                   |
| Test a service                     | Vitest with the repository mocked, or `mongodb-memory-server` for integration          | a full Nest test container for pure logic                 |

### Services

Services own orchestration and business rules. They:

- Take and return plain types (Zod-inferred from `@moc/contracts`), never Mongoose documents
- Are injected via constructor — no `@Inject` magic unless absolutely required
- Don't know HTTP exists — no `@Req`, no `Response`, no status codes
- Throw domain-shaped errors (`UserNotFoundError`, `RateLimitedError`) which the filter converts

A service longer than ~150 lines or with more than ~5 public methods is doing too much. Split by sub-domain.

### Repositories

A repository wraps Mongoose for one collection. It:

- Is the **only** place that imports `Model<T>` for that collection
- Returns plain objects (`.lean()`), never Mongoose documents — keeps Mongoose contained
- Has no business logic — `findActiveBy(...)` belongs in the service, not the repo
- Is testable by swapping the model implementation in tests, or by `mongodb-memory-server`

### Guards

Use guards for **authorization decisions about the request itself**: "is this caller allowed to call this endpoint at all?" or "does this caller own this resource?"

- `AuthGuard` — global default. Routes opt out with `@Public()`
- `OwnerGuard` — per-resource ownership check. Reads the param (`:id`) and the auth user

Don't use guards for input validation (that's Zod) or for business-rule decisions like "the user's plan allows this" (that's the service).

### Filters

Exactly **one** global `AllExceptionsFilter`:

- Maps thrown errors to the shared `ErrorResponse` Zod shape
- Logs at the boundary — one structured log per failed request
- Translates known domain errors (`UserNotFoundError` → 404, `RateLimitedError` → 429); everything else is 500

### Interceptors and middleware

Both exist; both are easily abused.

- **Interceptor** — request-scoped concern that wraps the handler. Use for: timing, response transformation. **Don't** use for: business logic, side effects.
- **Middleware** — Express-level. Use for: helmet, rate-limit, body-parser config. Don't use for anything you can do in NestJS proper.

When in doubt, prefer Nest primitives over Express middleware — they integrate with DI.

### Mongoose schemas

- One file per collection
- Define indexes alongside fields, not in a separate `init` block
- `versionKey: false` on every collection (we don't use optimistic concurrency yet)
- IDs: app-generated UUIDs in a separate `id` field, **not** Mongoose's `_id`. Mongo creates `_id` automatically; treat it as opaque
- Validation lives in Zod, not in Mongoose. Mongoose's `required: true` is fine but is not the source of truth

### Configuration

- All env reads via `ConfigService` — **no `process.env.X`** in a service body
- Read at module-init time (in `useFactory`), not on every request
- `getOrThrow` for required vars, `get` with default for optional

---

## apps/web — React

### Folder structure

```
apps/web/src/
├── main.tsx                # Entry — createRoot, providers
├── App.tsx                 # Top-level shell, router
├── index.css               # Global styles ONLY (resets, body, root vars)
├── routes.tsx              # Route table — single source of routes
├── components/             # Atomic, generic UI — Button, Card, Input
├── features/
│   └── <name>/             # One feature subtree per domain
│       ├── <Name>Page.tsx          # Page (or container) component
│       ├── components/             # Feature-private subcomponents
│       ├── hooks/                  # Feature-private hooks
│       └── api.ts                  # Feature-private fetchers (uses @moc/web-core)
├── hooks/                  # App-wide custom hooks (useAuth, useToast)
└── contexts/               # App-wide context providers (AuthProvider, ThemeProvider)
```

**Features are subtrees, not file dumps.** A feature that has more than ~5 files belongs in a folder with subfolders.

### Component sizing

Hard ceilings — when hit, split:

| Kind                                                 | Soft cap  | Hard cap  |
| ---------------------------------------------------- | --------- | --------- |
| Atomic component (`components/`)                     | 80 lines  | 120 lines |
| Feature subcomponent (`features/<name>/components/`) | 150 lines | 200 lines |
| Page (`<Name>Page.tsx`)                              | 200 lines | 300 lines |

Splits happen along three axes:

- **Subcomponents** — extract a JSX subtree that has its own state or props
- **Custom hooks** — extract stateful logic (the `useFeatureX` pattern)
- **Pure helpers** — move data transforms to `libs/web/core/` or the feature's `api.ts`

A 200-line component with 180 lines of JSX and 20 lines of logic is fine. A 100-line component with 80 lines of intertwined `useState` / `useEffect` / handlers is not — it's hiding a hook.

### When to use which hook

| Want                                   | Reach for                                                    | Don't                                                   |
| -------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------- |
| Local state                            | `useState`                                                   | a class component                                       |
| Side effect at mount/update            | `useEffect` with **explicit, minimal** dependencies          | logic in the component body that should be in an effect |
| Derived value from props/state         | a `const` (just compute it)                                  | `useMemo` for cheap computations                        |
| Expensive derived value                | `useMemo` with measured benefit                              | `useMemo` "for safety" everywhere                       |
| Stable callback for child memo         | `useCallback`                                                | `useCallback` on every handler                          |
| Cross-component state                  | `useContext` — only if used by ≥3 separated subtrees         | a global mutable object                                 |
| Server state                           | `fetchJson` in a feature hook (or TanStack Query when added) | `useEffect` + `setState` for fetch (race-prone)         |
| Imperative DOM access                  | `useRef`                                                     | `document.querySelector`                                |
| Track changing value without re-render | `useRef`                                                     | `useState` you never read                               |

### Custom hooks

- Prefix `use*`, always
- One responsibility per hook
- Return either an array tuple (for two values, like `useState`-style) or an object (for three or more)
- **Never side-effect during render** — all effects go in `useEffect`
- Hooks composed of other hooks live in `features/<name>/hooks/`; app-wide ones in `src/hooks/`

### Context

Context is a footgun. **The default answer is don't use context.** Use it only when **all three** are true:

1. The value is genuinely app-wide (auth, theme, user prefs)
2. At least three separated subtrees consume it
3. The value changes infrequently — every consumer re-renders when it changes

When a need looks contextual but fails one of the three:

- Single subtree → lift state up to the common parent
- Frequent updates → external store (Zustand) or refs, not context
- Server state → server-state library (TanStack Query when added), not context

`AuthProvider` is the canonical good case. `FormStateProvider` for one form is the canonical bad case.

### Components

- **Function components only.** No class components. No `forwardRef` unless a library demands it.
- Props typed with explicit interfaces, never `any`
- **Default exports forbidden** — named exports only (better refactor support, better grep)
- One component per file (atomic), or several tightly-coupled ones (feature subtree)
- No prop drilling past 2 levels — that's the signal to lift, hook, or (rarely) contextify

### Styling

- **Tailwind v4** is the styling layer. Utilities resolve to design-system tokens defined in `@moc/design-system`'s `theme.css` (a Tailwind v4 `@theme` block).
- **Tokens, not raw values.** `bg-primary`, `text-text-muted`, `rounded-md`, `p-4` — never `bg-[#5e2e92]` or arbitrary one-offs. If a value isn't in the token set, add it to the design system first; don't shortcut.
- **Components compose via Tailwind utilities.** Inline `style={{}}` is reserved for truly dynamic values (computed positions, animation transforms). No CSS Modules. No CSS-in-JS libraries.
- **App-level CSS is one file.** `apps/web/src/index.css` does only: `@import "tailwindcss";`, `@import "@moc/design-system/theme.css";`, and global resets. No per-feature CSS files.

See [`DESIGN.md`](DESIGN.md) for the full token reference and component catalog.

### Data fetching

- Always go through `fetchJson` from `@moc/web-core`. It validates the response against the shared Zod schema — drift between FE and BE fails at the boundary, not three components deep.
- **Loading and error states are required, not optional.** A fetch that doesn't render an error UI is a missing feature, not a stylistic choice.
- Don't fetch on every render. Either `useEffect` with stable deps and an in-flight guard, or a server-state library.
- Feature fetchers live in `features/<name>/api.ts` — never spread across components.

### Routing

- Single `routes.tsx` is the source of truth — every route is registered there
- Lazy-load route components when the route bundle exceeds ~50KB

---

## libs/shared/contracts

The Zod schemas here are the **wire format** between FE and BE. Both sides parse with the same schema; types are inferred (`z.infer<typeof X>`).

Rules:

- One file per domain (`users.ts`, `auth.ts`, `taste.ts`)
- Export both the schema (`User`) and the inferred type (`type User = z.infer<typeof User>`)
- No NestJS, no React, no Mongoose imports — Zod-only
- Versioning: when an API endpoint's shape changes incompatibly, add a new schema (`UserV2`), don't mutate the existing one

A schema in this lib that's used on only one side is a smell — either move it to the appropriate `core` lib, or pull it through to the other side.

---

## libs/api/core

Pure backend functions. Validators, transformers, business rules that have no I/O.

Rules:

- No `@nestjs/*` imports
- No `mongoose` imports
- No DB, no `fetch`, no `fs`, no `setTimeout`, no `Date.now()` outside the call site (pass `now` in)
- 100% deterministic — same input, same output, every time
- Tested with vitest in milliseconds

If you need to call a service or hit a DB, you're not writing core logic — you're writing a service.

---

## libs/web/core

Pure frontend functions. Formatters, parsers, the typed `fetchJson`.

Rules:

- No `react` imports (no hooks, no JSX)
- No DOM access
- No `window`, no `document` (except via passed-in arguments)
- Testable headlessly with vitest

Custom React hooks belong in `apps/web/src/hooks/` or `apps/web/src/features/<name>/hooks/`, not here. This lib is for things that work in any JS context.

---

## libs/web/design-system

Visual design system: tokens + components, exported as `@moc/design-system`.

### Folder structure

```
libs/web/design-system/
├── package.json
├── tsconfig.json
├── vite.config.ts            # for Ladle
├── vitest.config.ts
├── .ladle/
│   └── config.mjs
├── test/
│   └── setup.ts              # @testing-library/jest-dom registration
└── src/
    ├── index.ts              # re-exports every component
    ├── styles/
    │   ├── theme.css         # @theme — tokens (CSS vars + Tailwind utilities)
    │   └── index.css         # @import "tailwindcss"; @import "./theme.css";
    └── components/
        └── <Name>/
            ├── <Name>.tsx
            ├── <Name>.test.tsx
            └── <Name>.stories.tsx
```

### Rules

- **Tokens are the source of truth for visual style.** Every numeric or color value in a component resolves to a token (`bg-primary`, `p-4`, `rounded-md`). Never hard-code colors or pixel values.
- **No app imports.** The design system depends on React + Tailwind only. It must build standalone (Ladle confirms this) — if it can't, an app-level concern leaked in.
- **Self-contained tests.** `npm --workspace libs/web/design-system run test` runs only the DS component tests. They never depend on app state.
- **Stories are mandatory for new components.** A component without a `<Name>.stories.tsx` isn't done. Ladle is the visual review tool.
- **One component per folder.** Plus its test and story. Sub-components for composition (e.g. `<Tabs.Root>`) live next to the primary in the same folder.
- **API surface is small.** Components expose semantic variants (`primary` | `secondary` | `ghost`), not raw style props. If you find yourself adding `colorOverride`, `customRadius`, etc., the design system needs more tokens — go fix tokens, don't escape them.

### Stories (Ladle)

`npm --workspace libs/web/design-system run stories` opens Ladle on `http://localhost:61000`. Stories live alongside components and are auto-discovered by file name (`*.stories.tsx`). Ladle reuses the package's `vite.config.ts`, which loads `@tailwindcss/vite`.

### Adding a component

Use `/design-system`. Don't shortcut by hand-rolling components into `apps/web` then "moving them later" — that pattern accumulates duplicate visual logic.

---

## Cross-cutting rules

### Imports

- Workspace packages always via aliases: `@moc/contracts`, `@moc/api-core`, `@moc/web-core`, `@moc/design-system`. **Never `../../../libs/...`.**
- No barrel files inside `apps/` (causes Vite/Nest to over-bundle). Barrels are fine in `libs/*/src/index.ts`.
- Type-only imports use `import type {...}` — TS strips them, smaller output

### Naming

| Kind                   | Convention                                                                 |
| ---------------------- | -------------------------------------------------------------------------- |
| File (TS, code module) | `kebab-case.role.ts` (`users.controller.ts`)                               |
| File (TSX, component)  | `PascalCase.tsx` (`Button.tsx`)                                            |
| Class / type           | `PascalCase`                                                               |
| Function / variable    | `camelCase`                                                                |
| Const                  | `camelCase` for runtime, `SCREAMING_SNAKE_CASE` for module-level constants |
| Boolean                | `is*` / `has*` / `should*`                                                 |

### Error handling

- Throw domain errors (`UserNotFoundError`). Don't return `{ ok: false, error: ... }` from services.
- Catch only at the boundary — `AllExceptionsFilter` on api, error boundary on web
- Never swallow with `catch (e) { /* nothing */ }` — log or rethrow

### Logging

- One structured log per request boundary (entry + exit) via the filter
- **No `console.log` in feature code** — use the Nest logger; on the web, leave error UI to the error boundary, not console
- Never log full request bodies (PII risk) or env vars (secret leak)

### Tests

- Unit tests live next to the code (`<file>.test.ts`)
- Invariant tests live in `tests/invariants/<category>/` (mirrored from `INVARIANTS.md`)
- E2E in `tests/e2e/` (Playwright); temporary repros in `tests/_scratch/` (gitignored)

**Backend tests hit real upstreams (per AGENTS.md hard rule #15).** Music-provider clients in `apps/api/` are tested against the real provider — not against a `jest.mock(...)` of the client module. The cost is occasional flakiness from upstream rate limits / outages; the value is catching shape drift the moment it happens, instead of merging a green test that lies. Auth clients are the singular exception (mocked because OAuth redirects can't be replayed). A specific failure-mode test that needs a forced response shape can mock that one client iff the product-spec feature file says so explicitly, and the test quotes the line authorizing the override in a comment. Anything else is a no-go.

Where credentials are needed, they cascade through hard rule #9: `apps/api/.env.example` declares the key, `prepare-local` seeds it, both workflows seed it from a CI secret of the same name.

### Visual regression (Layer 3)

Three concentric rings, cheap to expensive:

| Ring                 | Tool                                              | What it catches                                                                                                       | When it runs                          |
| -------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| Layer 0 — lint       | `eslint-plugin-tailwindcss` `no-custom-classname` | "Left the design system" — `bg-[#abcdef]`, `mt-[7px]`, `text-[14px]`. Mechanical.                                     | Every commit (part of `npm run lint`) |
| Layer 1 — components | **Lost Pixel** snapshotting Ladle stories         | Visible regressions in `Typography`, `Button`, `BottomNav`, etc. — hover states, padding, color drift between tokens. | Part of `npm run verify`              |
| Layer 2 — pages      | **Playwright** `expect(page).toHaveScreenshot()`  | Integration regressions — components composed wrong, layout shifts, navigation visual states.                         | PR-only (slow)                        |

**Baselines are committed PNGs.** They live in `.lostpixel/baseline/` (Layer 1) and next to the spec in `tests/e2e/<page>.spec.ts-snapshots/` (Layer 2). Both are tracked in git so the PR diff shows old vs. new image side-by-side.

**Per AGENTS.md hard rule #12:** baseline regeneration is intentional, never blanket. When a snapshot fails:

1. **Default conclusion**: code is wrong. Fix source, not baseline.
2. **Only after deliberate analysis**: if the diff matches the change called for in the feature spec / `@claude` comment, regenerate the _specific_ failing snapshots. Never `--update` everything.
3. The PR review is the human gate — reviewer sees both code diff and visual diff, can reject either.

`/new-feature`, `/change-feature`, `/design-system`, and `/debug-local` all consume the visual layer the same way: the failure surfaces in `npm run verify`, the agent decides regenerate-vs-fix per the rule above, both code and PNGs land in the same PR.

**Auth is mocked universally** in Playwright specs via `apps/web/tests/e2e/fixtures.ts`. Every test starts authenticated as a stable `TEST_USER` so feature tests focus on the feature, not the sign-in dance. Specs **must** import `test` and `expect` from `./fixtures.js` — never directly from `@playwright/test`. To test unauthenticated UX (sign-in page, redirects), opt out per describe block with `test.use({ authed: false })`. The fixture only mocks `/api/me`; feature-specific endpoints stay the test's responsibility.

**Mocked responses are typed against `@moc/contracts`.** Use `mockJsonRoute(page, glob, schema, body)` / `mockJsonError(page, glob, status, error)` from the fixture rather than raw `r.fulfill({ body: JSON.stringify(...) })`. The helpers parse the body against the Zod schema at mock-write time, so a typo in the mock surfaces as a clear `ZodError` immediately instead of producing a confusing test failure later. When a contract schema in `@moc/contracts` legitimately changes (a field gets renamed, a property goes optional), mocks that referenced it fail loudly — exactly the drift signal that visual regression alone would miss because the mock was already shaped wrong.

**Every page snapshot pairs with an a11y assertion** (per AGENTS.md hard rule #13). After `toHaveScreenshot(...)`, the spec calls `await expectAccessible(page)` from `./fixtures.js` — a thin axe-core wrapper that runs the WCAG AA ruleset against the live DOM and fails the test on any contrast violation, missing label, invalid ARIA, or similar. The visual snapshot proves the page **looks** right; the a11y assertion proves it's **readable**. Both gates pass or the PR doesn't merge. A contrast failure on token-driven UI is a signal the token pair is wrong — fix `theme.css`, not the test.

**Raw HTML form elements are forbidden in `apps/web/`** when a design-system equivalent exists (per AGENTS.md hard rule #14). `<button>`, `<input>`, `<textarea>`, `<select>` are caught by `eslint-plugin`'s `no-restricted-syntax` against JSX opening elements — lint fails before the commit lands. The rule scopes to `apps/web/**`; `libs/web/design-system/**` keeps the raw tags (the components wrap them). When a feature wants a tag whose DS equivalent doesn't exist yet, that's a `/design-system` task **first**, not a one-off `<select>` in app code.

---

## Deployment

The app deploys on every push to `main`, gated on the verify pipeline passing. There is no separate staging environment — `main` is the deployed version.

### Surfaces

| Surface                    | Provider             | Free tier (always)                            | What's deployed                                           |
| -------------------------- | -------------------- | --------------------------------------------- | --------------------------------------------------------- |
| Web bundle                 | **Cloudflare Pages** | Unlimited bandwidth, 500 builds/mo            | `apps/web/dist/` (static SPA + PWA assets)                |
| API runtime                | **Google Cloud Run** | 2M req + 360k GiB-sec + 180k vCPU-sec / month | API container built from `apps/api/Dockerfile`            |
| Database                   | **MongoDB Atlas M0** | 512MB shared cluster                          | One shared cluster, one `moc` database                    |
| File storage (when needed) | **Cloudflare R2**    | 10GB storage, **$0 egress always**            | Reserved — no buckets created until a feature requires it |

The mix is deliberately multi-provider because a single-cloud free-tier story (e.g. all-Azure) loses on file storage egress charges past the 12-month free window, and Cosmos-as-Mongo introduces compatibility surface area for nothing in return.

### Trigger and gating

- `deploy-api` and `deploy-web` jobs in [.github/workflows/verify.yml](.github/workflows/verify.yml) run only on `push` to `main`, with `needs: [gitleaks, layer-1-build, layer-2-invariants]`. A red verify means no deploy.
- PR pushes do not deploy — verify only.
- The two deploy jobs are independent: API can succeed while web fails (or vice versa). Each is idempotent — re-running the same SHA produces the same result.

### Rollback

- **API**: Cloud Run keeps every revision. `gcloud run services update-traffic musy-api --to-revisions=<previous-revision>=100 --region=<region>` rolls traffic back instantly.
- **Web**: Cloudflare Pages keeps every deployment. Pages dashboard → Deployments → "Rollback to this deployment".

Neither rollback path requires touching the repo.

### Web ↔ API connection

The web reaches the API via an absolute URL pinned at build time. `VITE_API_URL` is a GitHub secret holding the Cloud Run service URL (e.g. `https://musy-api-xxxxxxx-uc.a.run.app`); Vite inlines it into the built bundle. The API's `WEB_ORIGIN` env var (read by `apps/api/src/main.ts`) is set on the Cloud Run service to the Pages URL (`https://musy.pages.dev` or a custom domain) so CORS allows it.

This is a **pin-after-bootstrap** model — Cloud Run service URLs are not predictable until the first deploy, so the very first web deploy fails until `VITE_API_URL` is set. Documented in [`DEPLOY.md`](DEPLOY.md). A Cloudflare Pages Function proxy that would have made `VITE_API_URL=/api` constant was considered and rejected: pinning a URL is one extra GitHub secret, while the proxy adds runtime hops, code, and a Pages Functions free-tier dependency.

### Build artifacts

- **API**: multi-stage [`apps/api/Dockerfile`](apps/api/Dockerfile) builds the workspace (npm ci at the root), compiles `apps/api`, prunes to production deps, and produces a small `node:22-alpine` image. The image is pushed to Google Artifact Registry; Cloud Run deploys the latest tag.
- **Web**: `npm run build --workspace apps/web` produces `apps/web/dist/`. The Cloudflare Pages action uploads the directory directly. Pages handles atomic swap; no CDN cache invalidation step.

### Secrets

Live in three places, never in the repo:

| Secret                                                                                                                              | Lives in                               | Used by                                |
| ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | -------------------------------------- |
| `GCP_SERVICE_ACCOUNT_KEY`, `GCP_PROJECT_ID`, `GCP_REGION`                                                                           | GitHub Actions secrets                 | API deploy job (build + push + deploy) |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `VITE_API_URL`                                                                     | GitHub Actions secrets                 | Web deploy job (build + upload)        |
| `MONGO_URI`, `SESSION_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `WEB_ORIGIN`, `ANTHROPIC_API_KEY` | Cloud Run service env / Secret Manager | API at runtime                         |

Runtime API config lives on Cloud Run rather than in GitHub for two reasons: the deploy workflow has no need to know it, and rotated values never have to round-trip through CI logs.

### Bootstrap

First-time setup is a multi-step manual sequence (account creation → resource provisioning → secret setting → first deploy). It is documented end-to-end in [`DEPLOY.md`](DEPLOY.md). Day-to-day deploys after bootstrap are just `git push origin main`.

---

## Why these rules and not others

Brief notes on trade-offs we've already made.

### Why npm workspaces, not Nx

We need: monorepo, two apps, shared TypeScript libs, fast tests. Nx adds generators and a task graph, but also adds a layer of indirection an AI agent has to learn. npm workspaces gives us 90% of the benefit with config that fits on one screen. We can switch to Nx when we feel concrete pain — likely around test caching and `affected` for the daily auto-PR loop.

### Why Mongoose (not Prisma)

Chosen because the user wants MongoDB. Mongoose has first-class NestJS support (`@nestjs/mongoose`) and TypeScript schema classes that read naturally for an AI agent. We pair it with Zod at HTTP boundaries — Mongoose owns persistence, Zod owns the API contract.

### Why Zod in `libs/shared/contracts/`

End-to-end type safety with one source of truth. NestJS controllers parse incoming bodies with `nestjs-zod`. The React fetcher parses responses with the same Zod schema. If the backend changes its response, the frontend's parser fails at the boundary, not in some downstream component. Drift is impossible.

### Why pure logic in `libs/`, side effects in `apps/`

Two reasons:

1. **Test surface** — pure functions test in milliseconds, no Nest container, no mongo, no DOM. The Layer 2 budget stays small.
2. **Invariants survive rewrites** — `LOGIC-*` invariants reference functions in `libs/` that are part of the project's stable API. They'd break if the lib was renamed, but not if the React/Nest layer was swapped.

### Why three layers of verification

Speed and signal-to-noise:

- **Layer 1 (lint + types + build)** is sub-second feedback on the most common AI failure modes (wrong import, type mismatch, syntax error).
- **Layer 2 (invariants + units)** is sub-minute feedback on logic and data contracts. This is where the bulk of correctness lives.
- **Layer 3 (browser/Playwright)** is the only place visual and PWA-installable behavior can be checked. It's slow, so it runs on PR, not save.

If we only had Layer 3, the AI would wait 10 minutes per iteration. If we only had Layer 1+2, visual bugs would ship.

### Why categorize invariants by constraint, not feature

Pulled directly from `agentic-dev-days-chess`. A per-feature taxonomy creates a graveyard of dead sections when features get refactored. A constraint-based taxonomy means every invariant has an obvious home and removing a feature never orphans rules. Adopting this from day one is much cheaper than refactoring later.

### Why hard rules exist (and are repeated everywhere)

The biggest failure mode of AI-maintained code is the agent silently weakening the spec to make tests pass. The hard rules in `AGENTS.md` exist to make that drift detectable. CI enforces what it can.

---

## Deferred decisions

The principle: pick when the first feature needs it. Premature decisions in an AI-maintained codebase calcify before they're stress-tested.

- **Authentication implementation** — the first auth feature defines the approach (cookie session vs JWT, magic-link vs OAuth)
- **AI provider choice** — pin when the first taste-processing feature lands
- **Server-state library** — TanStack Query is the default; pin when the first multi-component shared fetch arrives
- **Component styling** — CSS modules vs vanilla — pin at first non-trivial component
- **Caching layer (Redis, etc.)** — add when we feel pain
- **Lint-enforced architecture rules** — `eslint-plugin-import` `no-restricted-imports` could enforce the layer/import rules above mechanically. Deferred until we feel a violation slip through.
