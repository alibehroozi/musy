# moc — agent operating manual

Music app with AI-powered taste processing. Installable PWA. Maintained entirely by AI agents.

## Stack

- **Monorepo:** npm workspaces (`apps/*`, `libs/shared/*`, `libs/api/*`, `libs/web/*`)
- **Frontend:** React 18 + Vite + `vite-plugin-pwa`
- **Backend:** NestJS + Mongoose (MongoDB)
- **Shared contracts:** Zod schemas in `libs/shared/contracts/` — single source of truth for API shapes
- **Tests:** Vitest (libs + invariants), Jest (NestJS units), Playwright (E2E, Layer 3)
- **TypeScript:** strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` everywhere

## Project structure

- `apps/api/` — NestJS backend. One module per domain in `src/modules/<name>/`.
- `apps/web/` — React PWA. Components in `src/components/`, features in `src/features/<name>/`.
- `libs/shared/contracts/` — Zod schemas shared FE↔BE. Both NestJS controllers and the React fetcher parse with the same schema.
- `libs/api/core/` — pure backend logic (no NestJS deps). Testable without spinning up Nest.
- `libs/web/core/` — pure frontend logic (no React deps).
- `tests/invariants/<category>/` — invariant tests, mirroring `INVARIANTS.md` taxonomy.
- `INVARIANTS.md` — the spec. Every invariant has a stable ID and maps to a test.
- `TASKS.md` — current backlog.

## Hard rules

These are non-negotiable. CI enforces them. Do not bypass.

1. **If a test fails, fix the source code, not the test.** Invariant tests encode the spec.
2. **No secrets committed. Ever.** Includes API keys, OAuth client secrets, music-provider tokens, LLM keys, populated `.env` files, JWTs, private keys. Use `.env.example` with placeholder names; real values stay in local `.env` (gitignored) or CI secrets. Gitleaks runs in CI and pre-commit.
3. **TDD:** failing test first → green → refactor. The test must actually go red before implementation.
4. **Pure logic in libs, side effects in apps.** Business rules live in `libs/`. Database I/O, HTTP handlers, React lifecycle live in `apps/`.
5. **Zod schemas in `libs/shared/contracts/` are the API contract.** Both NestJS (via `nestjs-zod`) and React parse with the same schema. No drift.
6. **Do not touch without explicit human approval:**
   - `INVARIANTS.md` — only via `/new-invariant`
   - `package.json` dependency additions — propose first, get sign-off
   - `.github/workflows/`
   - any `.env*` file other than `.env.example`
7. **Privacy:** user listening history and identifiers never leak across users, never appear in third-party logs, and never reach LLM prompts unless the prompt explicitly requires them and the call site is annotated with the reason.

## Invariant workflow

Invariants are guardrails — properties that fail the moment the code drifts. See `INVARIANTS.md` for the taxonomy. **Categories are by what they constrain, never by feature.**

When adding a feature:

1. Append rows to the matching category in `INVARIANTS.md`. Never create a per-feature section.
2. Stub `tests/invariants/<category>/<feature>.test.ts` using `describe("<ID>: <description>", ...)`.
3. Run the stub — confirm it fails (red).
4. Implement: pure logic in `libs/`, then wire UI/API in `apps/`.
5. Run `npm run verify` until green.

Use `/new-invariant` for guided invariant authoring.

## Verification pipeline

```
Layer 1: Lint + Types + Build              (seconds)   On every save
Layer 2: Invariant + unit + integration    (seconds)   On every save
Layer 3: Playwright E2E + visual           (~minutes)  On every PR
```

Local commands:

- `npm run verify` — Layers 1 + 2
- `npm run test:invariants` — invariants only
- `npm run dev` — both apps in parallel
- `npm run e2e` — Playwright (Layer 3)

CI runs Layer 1 + 2 + gitleaks on every PR via `.github/workflows/verify.yml`. Layer 3 runs against the preview deploy.

## Adding a new NestJS module

1. Create `apps/api/src/modules/<name>/` mirroring the structure of `users/`
2. Mongoose schema in `<name>.schema.ts`
3. DTOs use Zod schemas imported from `@moc/contracts`
4. Add invariants under `DATA-*`, `API-*`, and `SEC-*` as applicable

## Adding a new React feature

1. Pure logic → `libs/web/core/<name>/`
2. Components → `apps/web/src/features/<name>/`
3. API calls validate responses with the `@moc/contracts` Zod schema
4. Add invariants under `LOGIC-*`, `UI-*`, `BROWSER-*` as applicable
