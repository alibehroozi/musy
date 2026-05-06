# musy

Music app with AI-powered taste processing. Installable PWA. Maintained entirely by AI agents.

## Quick start

```bash
npm install
cp .env.example .env   # fill in real values
npm run dev            # API on :3001, web on :5173
```

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
