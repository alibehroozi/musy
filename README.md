# musy

Music app with AI-powered taste processing. Installable PWA. Maintained entirely by AI agents.

## Quick start

Prereqs: **Node ≥ 20**, **Docker Desktop** (for Mongo).

```bash
npm install
cp .env.example .env   # fill in real values
npm run db:up          # start MongoDB + Mongo Express in Docker
npm run dev            # API on :3001, web on :5173
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
- **Adding a feature?** Read [`INVARIANTS.md`](INVARIANTS.md) and use `/new-invariant`.
- **What's next?** Read [`TASKS.md`](TASKS.md).
- **Why is it like this?** Read [`ARCHITECTURE.md`](ARCHITECTURE.md).

## Stack

React + Vite (PWA) · NestJS · MongoDB + Mongoose · Zod (shared contracts) · Vitest · Jest · Playwright
