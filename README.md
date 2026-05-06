# musy

Music app with AI-powered taste processing. Installable PWA. Maintained entirely by AI agents.

## Quick start

Prereqs: **Node ≥ 20**, **Docker Desktop** (for Mongo).

**With Claude Code:** run `/prepare-local` — it probes the prereqs, installs deps, copies missing `.env` files, brings up Docker, and tells you what's blank. Then `npm run dev`.

**Manually:**

```bash
npm install
cp apps/api/.env.example apps/api/.env   # backend secrets (Mongo, AI keys)
cp apps/web/.env.example apps/web/.env   # frontend build-time config
npm run db:up                            # start MongoDB + Mongo Express in Docker
npm run dev                              # API on :3001, web on :5173
```

Open the app at http://localhost:5173. Browse the database at http://localhost:8181.

### Local infrastructure

Stateful infra runs in Docker; the apps run on the host for fast hot-reload.

| Command            | What it does                                  |
| ------------------ | --------------------------------------------- |
| `npm run db:up`    | start Mongo + Mongo Express (detached)        |
| `npm run db:down`  | stop containers (data persists in the volume) |
| `npm run db:logs`  | tail container logs                           |
| `npm run db:reset` | wipe the volume — nukes all dev data          |

Services:

- **MongoDB** at `mongodb://localhost:27117` — connection string in `.env` (`MONGO_URI`). The non-default port (`27117` instead of the standard `27017`) is intentional, so Docker doesn't collide with any other local mongo.
- **Mongo Express** at http://localhost:8181 — browse collections, edit docs, run queries.

## Verification

```bash
npm run verify             # Layer 1 + 2: lint, types, tests
npm run test:invariants    # invariants only
npm run e2e                # Layer 3: Playwright (TODO)
```

## Where to start

- **Working with the codebase?** Read [`AGENTS.md`](AGENTS.md) — the operating manual.
- **Adding a feature?** Describe what you want and run `/new-feature` (which uses `/new-invariant` internally).
- **Debugging a reported issue?** Run `/debug-local`.
- **Why is it like this?** Read [`ARCHITECTURE.md`](ARCHITECTURE.md).

## Environment files

Per-app, never shared. Backend secrets must not reach the frontend bundle.

| File            | Loaded by                     | What lives here                                                                    |
| --------------- | ----------------------------- | ---------------------------------------------------------------------------------- |
| `apps/api/.env` | NestJS ConfigModule (runtime) | `MONGO_URI`, `ANTHROPIC_API_KEY`, OAuth secrets, session keys — server-only        |
| `apps/web/.env` | Vite (build time)             | `VITE_API_URL` and other `VITE_*` vars that get **inlined into the public bundle** |

`apps/api/.env.example` and `apps/web/.env.example` are committed templates. Real `.env` files are gitignored and never travel with builds.

## Deployment

Each app deploys to a different surface:

- **Backend (`apps/api`)** → a runtime host (Render, Fly.io, Railway, AWS ECS, etc.). Set `apps/api/.env` values via the platform's secret manager. No `.env` file in the build.
- **Frontend (`apps/web`)** → a static host (Vercel, Netlify, Cloudflare Pages). Set `VITE_*` vars in the platform's build environment — they're inlined at build time.
- **MongoDB** → MongoDB Atlas (or self-hosted). Replace `MONGO_URI` with the production connection string in the API's secret manager.

In production, `VITE_API_URL` is either:

- the absolute API URL (cross-origin) — requires `WEB_ORIGIN` set on the API for CORS, **or**
- `/api` (same origin) — requires a reverse proxy / CDN edge function routing `/api/*` to the backend.

## Stack

React + Vite (PWA) · NestJS · MongoDB + Mongoose · Zod (shared contracts) · Vitest · Jest · Playwright
