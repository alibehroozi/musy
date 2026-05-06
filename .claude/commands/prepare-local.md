---
description: Verify local prerequisites and bring up everything needed for `npm run dev` to work
---

# Prepare local development

A bring-up checklist. **Idempotent** — safe to run repeatedly. After this passes, `npm run dev` works.

If you find that a tool the project needs is missing from this checklist, that means a recent change added a dependency without updating this command. Add the check here, flag it to the user, then re-run.

## Step 1 — Prerequisites

Verify the user has the system tools we depend on. Probe each; if missing, tell the user how to install and **stop**.

| Tool              | Probe                    | Required   | If missing                                             |
| ----------------- | ------------------------ | ---------- | ------------------------------------------------------ |
| Node              | `node --version`         | ≥ 20       | https://nodejs.org or via nvm/asdf                     |
| npm               | `npm --version`          | ≥ 10       | bundled with Node                                      |
| Docker            | `docker --version`       | any modern | https://docker.com/products/docker-desktop             |
| Docker Compose    | `docker compose version` | v2+        | bundled with Docker Desktop                            |
| Docker daemon     | `docker info`            | running    | open Docker Desktop                                    |
| gh CLI (optional) | `gh --version`           | any        | https://cli.github.com — only required for PR creation |

Run probes in parallel where possible. Report a single status line per tool.

## Step 2 — Install dependencies

\```bash
[ -d node_modules ] || npm install
\```

If `node_modules/` is missing → install. If present, skip (trust the user to re-install when `package-lock.json` changes; we don't second-guess that here).

`npm install` also runs husky's `prepare` and registers the pre-commit hook.

## Step 3 — Env files

For each app, ensure a real `.env` exists. If not, copy from the example and **tell the user what's blank** so they know what to fill before running.

\```bash
[ -f apps/api/.env ] || cp apps/api/.env.example apps/api/.env
[ -f apps/web/.env ] || cp apps/web/.env.example apps/web/.env
\```

Then read each `.env` and validate:

**`apps/api/.env`** — required keys (error if blank):

- `API_PORT` (default 3001)
- `MONGO_URI` — must point at the docker mongo (`mongodb://localhost:27117/...`); if it points at a different port, the API will silently use someone else's mongo
- `WEB_ORIGIN` (default `http://localhost:5173`)

**`apps/api/.env`** — optional keys (warn if blank, don't error):

- `ANTHROPIC_API_KEY` — needed when AI features land
- `OPENAI_API_KEY` — alternate provider
- (any provider keys added by future features — see the maintenance note at the bottom of this command)

**`apps/web/.env`** — required keys:

- `VITE_API_URL` (default `/api`)

For each blank required key, tell the user the exact file path + key. For each blank optional key, list it as a follow-up the user will need to fill before that feature works.

## Step 4 — Bring up infrastructure

\```bash
npm run db:up
\```

Then poll until `musy-mongo` is healthy:

\```bash
docker compose ps --format "{{.Name}} {{.Status}}" | grep "musy-mongo .\*healthy"
\```

Confirm Mongo Express is responding:

\```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:8181/
\```

If a port is already bound by another container (common: a `bannerflow-mongo` or other project's stack on `:27017` or `:8081`), tell the user the exact container name holding it. Don't try to stop it — that's their other project.

## Step 5 — Status summary

Report tight, scannable lines. Green checks plus any blocker items the user needs to act on.

Example green output:

\```
✅ Node 22.13.1, npm 10.9.2, docker 27.4
✅ Dependencies installed
✅ apps/api/.env (ANTHROPIC_API_KEY blank — set when AI features land)
✅ apps/web/.env
✅ MongoDB mongodb://localhost:27117 (healthy)
✅ Mongo UI http://localhost:8181

Run: npm run dev
\```

Example red output:

\```
✅ Node 22.13.1, npm 10.9.2
❌ Docker daemon not running — open Docker Desktop and re-run /prepare-local
\```

Stop at the first blocker; don't continue probing past a hard failure.

## Hard rules

- **Idempotent.** Two runs in a row produce the same green result and don't break anything.
- **Read-only on user files.** Don't overwrite an existing `.env`. Don't `npm install --force`. Don't `docker compose down -v` (that wipes data).
- **Respect the deny list.** Editing `.env` directly is denied; this command only ever **copies** from `.env.example` via Bash `cp` when the target is missing.
- **No silent fixes.** If a probe fails, surface it. Don't auto-install Node, don't auto-start Docker Desktop. Surface, instruct, stop.

## Watch out for

- **Stale knowledge.** Before running, scan `docker-compose.yml` and both `.env.example` files. If there are services or env vars this command isn't checking, **add the checks before proceeding** and flag it: that means a recent command change skipped its obligation to update `/prepare-local`.

## Maintenance contract

This command is **the canonical local-dev bring-up procedure**. When other commands change local-dev requirements, they must update this file in the same PR.

Triggers that require updating this command:

| If a change adds/modifies…                                               | Update here                                              |
| ------------------------------------------------------------------------ | -------------------------------------------------------- |
| A docker service in `docker-compose.yml`                                 | Add a healthcheck step in Step 4, plus the URL in Step 5 |
| A required env var in `apps/api/.env.example` or `apps/web/.env.example` | Add the presence check in Step 3                         |
| A new system dep (Playwright browsers, native module, CLI tool)          | Add the probe in Step 1                                  |
| A new port binding                                                       | Update the URL list in Step 5                            |
| A new auto-init step (DB seed, migration, fixture)                       | Add the step here                                        |

If you ever run `/prepare-local` and find the green output doesn't actually mean `npm run dev` works, that's a bug — fix this command and whatever recent change forgot to update it.
