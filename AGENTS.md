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
8. **Conform to `ARCHITECTURE.md`.** All new implementations and fixes follow the per-package layout, layering, and "when to use what" rules in [`ARCHITECTURE.md`](ARCHITECTURE.md). If a constraint there blocks something legitimate, raise it as a question — don't silently bypass.
9. **Keep `/prepare-local` current.** If a change adds or modifies a local-dev requirement (a new docker service, a new required env var, a new system dep, a new port, a new init step), update `.claude/commands/prepare-local.md` in the same PR. A fresh checkout running `/prepare-local` must always end with a working `npm run dev`.

## Invariant workflow

Invariants are guardrails — properties that fail the moment the code drifts. See `INVARIANTS.md` for the taxonomy. **Categories are by what they constrain, never by feature.**

When adding a feature:

1. Append rows to the matching category in `INVARIANTS.md`. Never create a per-feature section.
2. Stub `tests/invariants/<category>/<feature>.test.ts` using `describe("<ID>: <description>", ...)`.
3. Run the stub — confirm it fails (red).
4. Implement: pure logic in `libs/`, then wire UI/API in `apps/`.
5. Run `npm run verify` until green.

Use `/new-invariant` for guided invariant authoring.

## Slash commands

The `.claude/commands/` directory encodes workflows so the procedure survives across sessions and agents. Use them — they exist precisely so day-100 work follows the same shape as day-1 work.

| Command                | When to use                                                                                                                                                                                                                                                                                     |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/new-invariant`       | Define invariants for a feature (the spec step). Three phases: explore the codebase, suggest 2–4 candidates with reasoning, write to `INVARIANTS.md` and stub tests red after user sign-off.                                                                                                    |
| `/new-feature`         | Implement a feature end-to-end. Calls `/new-invariant` internally, then libs-first implementation, verify, manual exercise, PR.                                                                                                                                                                 |
| `/change-feature`      | Modify an existing feature. Audits affected invariants, requires sign-off before removing any rule, prevents adjacent-feature regressions.                                                                                                                                                      |
| `/debug-local`         | Diagnose a reported issue. Tiered: invariants first → local repro → temp Playwright → fix → **promote the repro to a permanent invariant.**                                                                                                                                                     |
| `/change-architecture` | Propose and implement an architectural change. Five phases: understand → **debate hard** (agent pushes back, names alternatives) → spec commit (`ARCHITECTURE.md`) → code migration → verify. Two commits, spec first.                                                                          |
| `/prepare-local`       | Bring up the local dev environment. Idempotent. Probes Node/Docker, installs deps, copies missing `.env` files from examples, brings up Mongo + Mongo Express, reports green/red status. Source-of-truth for local setup — every other command updates this when it changes local requirements. |
| `/verify`              | Run `npm run verify` and produce a tight summary of failures.                                                                                                                                                                                                                                   |

## Local development

Stateful infra runs in Docker; the apps run on the host.

```bash
npm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
npm run db:up        # start mongo + mongo-express
npm run dev          # api (:3001) + web (:5173) in parallel
```

Mongo Express UI at http://localhost:8181 — useful for verifying that a feature actually wrote what it claimed to.

`npm run db:reset` nukes the dev volume — use it when a schema change makes existing dev data inconsistent.

## Environment files (strict separation)

| File            | Read by            | Allowed contents                                                                          |
| --------------- | ------------------ | ----------------------------------------------------------------------------------------- |
| `apps/api/.env` | NestJS at runtime  | Server-only secrets: `MONGO_URI`, `ANTHROPIC_API_KEY`, OAuth client secrets, session keys |
| `apps/web/.env` | Vite at build time | `VITE_*` config inlined into the public bundle. **No secrets, ever.**                     |

**Never share env values between the two files.** If a backend secret leaked into `apps/web/.env`, Vite could inline it into the public JS bundle and ship it to every browser. The split is a safety boundary, not a stylistic choice.

When adding a new env var, ask: does any user-agent ever need to see this? If no → goes in `apps/api/.env.example`. If yes → it's not a secret; goes in `apps/web/.env.example` with a `VITE_` prefix.

## Deployment shape (forward-looking)

The repo is structured for two deploy surfaces:

- **API → runtime host** (Render / Fly / Railway / ECS). Real env vars come from the platform's secret manager. The `.env` file does not exist in production.
- **Web → static host** (Vercel / Netlify / Cloudflare Pages). `VITE_*` vars are set in the platform's build settings and inlined at build time. The static bundle is then served from CDN.
- **Mongo → managed** (Atlas) or self-hosted; `MONGO_URI` lives only in the API's secret manager.

CORS in `apps/api/src/main.ts` reads `WEB_ORIGIN` — set it to the deployed web origin in prod. Set `VITE_API_URL` in the web's deploy env to either the absolute API URL or `/api` (if behind a same-origin proxy).

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
