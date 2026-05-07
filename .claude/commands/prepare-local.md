---
description: Verify local prerequisites and bring up everything needed for `npm run dev` to work
---

# Prepare local development

A bring-up checklist. **Idempotent** — safe to run repeatedly. After this passes, `npm run dev` works.

If you find that a tool the project needs is missing from this checklist, that means a recent change added a dependency without updating this command. Add the check here, flag it to the user, then re-run.

## Step 0 — Pre-flight: must run in the main checkout

Per AGENTS.md hard rule #11: this command writes `.env.local` files (gitignored) and brings up shared docker state. None of that propagates from a Claude Code worktree back to the main repo, so running here in a worktree silently leaves the user's main checkout untouched.

Run the canonical worktree detection from `AGENTS.md` first:

\```bash
common_dir=$(git rev-parse --git-common-dir)
case "$common_dir" in
".git" | "$(pwd)/.git") echo "main" ;;
  *) echo "worktree (main is $(dirname "$common_dir"))" ;;
esac
\```

- **"main"** → continue to Step 1.
- **"worktree …"** → **stop**. Tell the user:

  > I'm running in a Claude Code worktree at `<pwd>`. /prepare-local writes `.env.local` (gitignored) and configures shared Docker state — neither follows back to your main checkout. Re-invoke me without `isolation: "worktree"`, or run me from the main repo at `<main_path>`.

  Do not try to write absolute paths into the main checkout from inside the worktree — the sandbox typically blocks it, and the implicit cross-tree write is confusing even when it doesn't.

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

**Use the `Write` and `Edit` tools to author `.env.local`. Do not use `cp`, `Bash` heredocs, or `sed` — those routinely fail under sandbox restrictions. `Write`/`Edit` is the supported path.**

### 3a — Resolve free ports

Probe `API_PORT` (default 3001) and `VITE_WEB_PORT` (default 5173):

\```bash

# in-use if the port is bound, free otherwise

port_state() { lsof -i :"$1" >/dev/null 2>&1 && echo in-use || echo free; }

# next free port at or after $1

next_free() {
local p=$1
  while lsof -i :"$p" >/dev/null 2>&1; do p=$((p+1)); done
  echo "$p"
}
\```

Algorithm:

1. If `apps/api/.env.local` exists, read its current `API_PORT`; otherwise default to 3001.
2. If that port is **in-use**, run `next_free` from it to pick a replacement. **Don't override** a non-default port the user already set if it's free — that may be deliberate.
3. Same for `VITE_WEB_PORT` from `apps/web/.env.local`, default 5173.
4. The two ports drive four values in lock-step: `API_PORT` ↔ `VITE_API_TARGET` (the web's dev proxy target), and `VITE_WEB_PORT` ↔ `WEB_ORIGIN` (the api's CORS origin).

### 3b — Write the env files

Use `Write` (whole file) when `.env.local` is missing; use `Edit` (per-key) when it already exists.

**Keys this command owns.** These are always rewritten by `/prepare-local` — never edit them by hand.

| File                  | Owned keys                         |
| --------------------- | ---------------------------------- |
| `apps/api/.env.local` | `API_PORT`, `WEB_ORIGIN`           |
| `apps/web/.env.local` | `VITE_API_TARGET`, `VITE_WEB_PORT` |

**Keys this command seeds but doesn't overwrite.** Written once on file creation; preserved on subsequent runs so the user can edit freely.

| File                  | Seeded keys                                                                                                                                                                                                                                                                              |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/.env.local` | `NODE_ENV=development`, `MONGO_URI=mongodb://localhost:27117/musy`, `ANTHROPIC_API_KEY=`, `OPENAI_API_KEY=`, `GOOGLE_CLIENT_ID=`, `GOOGLE_CLIENT_SECRET=`, `GOOGLE_REDIRECT_URI=http://localhost:<web_port>/api/auth/google/callback`, `SESSION_SECRET=<freshly generated random bytes>` |
| `apps/web/.env.local` | `VITE_API_URL=/api`                                                                                                                                                                                                                                                                      |

For `SESSION_SECRET`, generate a fresh value at file creation:

\```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
\```

For `GOOGLE_REDIRECT_URI`, default to `http://localhost:<web_port>/api/auth/google/callback` so it tracks the resolved web port. The user is responsible for registering the same URI in Google Cloud Console (Authorized redirect URIs).

**Fresh-write content** (when the file does not exist) — the `Write` tool's `content` field, with `<api_port>`, `<web_port>`, and `<session_secret>` substituted:

`apps/api/.env.local`:

\```

# Backend runtime — local dev. Generated by /prepare-local.

# Owned keys (rewritten on every run): API_PORT, WEB_ORIGIN

# Seeded keys (preserved if you edit them): MONGO_URI, ANTHROPIC_API_KEY, OPENAI_API_KEY,

# GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI, SESSION_SECRET

NODE_ENV=development
API_PORT=<api_port>
WEB_ORIGIN=http://localhost:<web_port>
MONGO_URI=mongodb://localhost:27117/musy
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:<web_port>/api/auth/google/callback
SESSION_SECRET=<session_secret>
\```

`apps/web/.env.local`:

\```

# Frontend build-time — local dev. Generated by /prepare-local.

# Owned keys (rewritten on every run): VITE_API_TARGET, VITE_WEB_PORT

# Seeded keys (preserved if you edit them): VITE_API_URL

VITE_API_URL=/api
VITE_API_TARGET=http://localhost:<api_port>
VITE_WEB_PORT=<web_port>
\```

**Update existing-file content.** When `.env.local` already exists, use `Edit` for each owned key, replacing only the value. Idempotent — if the value is already correct, the rewrite is a no-op. Never use `Edit` on a seeded key here; that's the user's territory.

If a legacy `apps/api/.env` or `apps/web/.env` exists from before the convention switch, leave it alone — the fallback loaders mean it still works. Note it as something the user may want to rename for consistency.

### 3c — Surface what the user still needs to fill

Read the resulting `.env.local` files and report:

- Blank `MONGO_URI` (required) → error
- Blank `SESSION_SECRET` (required for the API to start; should never be blank since `/prepare-local` generates it on file creation) → error, and instruct the user to delete the line so the next run regenerates it
- Blank `GOOGLE_CLIENT_ID` or `GOOGLE_CLIENT_SECRET` (required for sign-in to actually work; the API still boots without them) → warn, and tell the user to register an OAuth 2.0 Client ID at https://console.cloud.google.com/apis/credentials with the `GOOGLE_REDIRECT_URI` from this file as the Authorized redirect URI, then paste the values into `apps/api/.env.local`
- Blank optional keys (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, etc.) → list as follow-ups the user fills when the relevant feature lands

Don't error on the OAuth-credential warnings; the user may legitimately be running prepare-local before they've created the OAuth client.

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

- **Idempotent.** Two runs in a row produce the same green result and don't break anything. Owned keys get rewritten with the same values; seeded keys are preserved.
- **`Write`/`Edit` only.** Never use `cp` or Bash heredocs to author `.env.local` — those fail under common sandbox restrictions. The `Write` tool creates the file fresh (when missing); `Edit` updates an owned key in place (when present).
- **Don't touch seeded keys after creation.** Once `.env.local` exists, the user owns the seeded keys (`MONGO_URI`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `VITE_API_URL`). This command only rewrites owned keys (`API_PORT`, `WEB_ORIGIN`, `VITE_API_TARGET`, `VITE_WEB_PORT`).
- **`.env`, `.env.development`, `.env.production`, `.env.test` stay denied.** Only `.env.local` is writable, and only via `Write` (initial) or `Edit` (owned-key update).
- **No silent fixes.** If a probe fails, surface it. Don't auto-install Node, don't auto-start Docker Desktop. Don't `npm install --force`. Don't `docker compose down -v` (wipes data). Surface, instruct, stop.

## Watch out for

- **Stale knowledge.** Before running, scan `docker-compose.yml` and both `.env.example` files. If there are services or env vars this command isn't checking, **add the checks before proceeding** and flag it: that means a recent command change skipped its obligation to update `/prepare-local`.

## Maintenance contract

This command is **the canonical local-dev bring-up procedure**. When other commands change local-dev requirements, they must update this file in the same PR.

Triggers that require updating this command:

| If a change adds/modifies…                                               | Update here                                                                                                      |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| A docker service in `docker-compose.yml`                                 | Add a healthcheck step in Step 4, plus the URL in Step 5                                                         |
| A required env var in `apps/api/.env.example` or `apps/web/.env.example` | Add to the seeded-keys list AND fresh-write template in Step 3b; add the presence check in Step 3c               |
| A new system dep (Playwright browsers, native module, CLI tool)          | Add the probe in Step 1                                                                                          |
| A new port binding                                                       | Add port-state probing for it in Step 3a, update Step 5                                                          |
| A new app-level port that must be writable to `.env.local`               | Add it as an **owned key** in Step 3b, include it in the lock-step group with whichever paired key it relates to |
| A new auto-init step (DB seed, migration, fixture)                       | Add the step here                                                                                                |

If you ever run `/prepare-local` and find the green output doesn't actually mean `npm run dev` works, that's a bug — fix this command and whatever recent change forgot to update it.
