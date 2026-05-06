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

The local-dev convention is **`.env.local`** (gitignored). NestJS reads `.env.local` first and falls back to `.env`; Vite loads `.env.local` automatically and lets it override `.env`. The `.env.example` files are the committed templates.

### 3a — Create the files if missing

\```bash
[ -f apps/api/.env.local ] || cp apps/api/.env.example apps/api/.env.local
[ -f apps/web/.env.local ] || cp apps/web/.env.example apps/web/.env.local
\```

If a legacy `apps/api/.env` or `apps/web/.env` exists from before the switch, leave it alone — the fallback loaders mean it still works. Note it as something the user may want to rename for consistency.

### 3b — Resolve free ports and write them

The defaults are `API_PORT=3001` and `VITE_WEB_PORT=5173`. If either is in use, pick the next free port and update both files in lock-step (the API port + the web's proxy target must match; the web port + the api's CORS origin must match).

For each port, probe and pick:

\```bash

# returns "in use" if the port is bound, "free" otherwise

port_state() { lsof -i :"$1" >/dev/null 2>&1 && echo in-use || echo free; }

# returns the next free port at or after $1

next_free() {
local p=$1
  while lsof -i :"$p" >/dev/null 2>&1; do p=$((p+1)); done
  echo "$p"
}
\```

Algorithm:

1. Read `API_PORT` from `apps/api/.env.local`. If `port_state` says **in-use** AND no other process holding it is the user's previous run of this app, run `next_free` from that value to find a replacement.
2. Same for `VITE_WEB_PORT` from `apps/web/.env.local`.
3. If either changed, write the updated values:
   - `API_PORT` → `apps/api/.env.local`
   - `WEB_ORIGIN` in `apps/api/.env.local` → `http://localhost:<VITE_WEB_PORT>`
   - `VITE_WEB_PORT` → `apps/web/.env.local`
   - `VITE_API_TARGET` in `apps/web/.env.local` → `http://localhost:<API_PORT>`
4. Surface the chosen ports in the summary.

Use `sed -i ''` (macOS) or `sed -i` (Linux) for the in-place updates, or the `Edit` tool — both work since `.env.local` is no longer in the deny list. Edits are idempotent: if the value is already correct, the rewrite is a no-op.

Don't touch ports that are already non-default in `.env.local` and currently free — the user may have set them deliberately.

### 3c — Validate required keys

Read each `.env.local` after the port pass:

**`apps/api/.env.local`** — required (error if blank):

- `API_PORT` — set in 3b
- `MONGO_URI` — must point at the docker mongo (`mongodb://localhost:27117/...`); if it points at a different port, the API will silently use someone else's mongo
- `WEB_ORIGIN` — set in 3b

**`apps/api/.env.local`** — optional (warn if blank, don't error):

- `ANTHROPIC_API_KEY` — needed when AI features land
- `OPENAI_API_KEY` — alternate provider
- (any provider keys added by future features — see the maintenance note at the bottom)

**`apps/web/.env.local`** — required:

- `VITE_API_URL` — runtime URL the browser hits (default `/api`)
- `VITE_API_TARGET` — dev proxy target, set in 3b
- `VITE_WEB_PORT` — set in 3b

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
✅ apps/api/.env.local (API_PORT 3001, ANTHROPIC_API_KEY blank — set when AI features land)
✅ apps/web/.env.local (VITE_WEB_PORT 5173, VITE_API_TARGET http://localhost:3001)
✅ MongoDB mongodb://localhost:27117 (healthy)
✅ Mongo UI http://localhost:8181

Run: npm run dev
\```

If a port had to be reallocated:

\```
⚠️ 3001 was in use → API_PORT moved to 3002 (apps/api/.env.local)
apps/web/.env.local VITE_API_TARGET updated to match
\```

Example red output:

\```
✅ Node 22.13.1, npm 10.9.2
❌ Docker daemon not running — open Docker Desktop and re-run /prepare-local
\```

Stop at the first blocker; don't continue probing past a hard failure.

## Hard rules

- **Idempotent.** Two runs in a row produce the same green result and don't break anything.
- **Read-only on user files.** Don't overwrite an existing `.env.local` or `.env`. Don't `npm install --force`. Don't `docker compose down -v` (that wipes data).
- **Respect the deny list.** `.env.local` is editable for the port-write in 3b only — never edit it for any other reason. `.env`, `.env.development`, `.env.production`, `.env.test` are denied entirely; copying from `.env.example` via Bash `cp` is the only allowed way to seed a new `.env.local`.
- **No silent fixes.** If a probe fails, surface it. Don't auto-install Node, don't auto-start Docker Desktop. Surface, instruct, stop.

## Watch out for

- **Stale knowledge.** Before running, scan `docker-compose.yml` and both `.env.example` files. If there are services or env vars this command isn't checking, **add the checks before proceeding** and flag it: that means a recent command change skipped its obligation to update `/prepare-local`.

## Maintenance contract

This command is **the canonical local-dev bring-up procedure**. When other commands change local-dev requirements, they must update this file in the same PR.

Triggers that require updating this command:

| If a change adds/modifies…                                               | Update here                                              |
| ------------------------------------------------------------------------ | -------------------------------------------------------- |
| A docker service in `docker-compose.yml`                                 | Add a healthcheck step in Step 4, plus the URL in Step 5 |
| A required env var in `apps/api/.env.example` or `apps/web/.env.example` | Add the presence check in Step 3 (against `.env.local`)  |
| A new system dep (Playwright browsers, native module, CLI tool)          | Add the probe in Step 1                                  |
| A new port binding                                                       | Add port-state probing for it in Step 3b, update Step 5  |
| A new app-level port that must be writable to `.env.local`               | Add it to the lock-step write loop in Step 3b            |
| A new auto-init step (DB seed, migration, fixture)                       | Add the step here                                        |

If you ever run `/prepare-local` and find the green output doesn't actually mean `npm run dev` works, that's a bug — fix this command and whatever recent change forgot to update it.
