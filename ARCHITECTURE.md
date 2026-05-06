# Architecture

Short, high-signal notes on **why** things are the way they are. Not a tour of files (that's `AGENTS.md`).

## Why npm workspaces, not Nx

We need: monorepo, two apps, shared TypeScript libs, fast tests. Nx adds generators and a task graph, but also adds a layer of indirection an AI agent has to learn. npm workspaces gives us 90% of the benefit with config that fits on one screen. We can switch to Nx when we feel concrete pain — likely around test caching and `affected` for the daily auto-PR loop.

## Why Mongoose (not Prisma)

Chosen because the user wants MongoDB. Mongoose has first-class NestJS support (`@nestjs/mongoose`) and TypeScript schema classes that read naturally for an AI agent. We pair it with Zod at HTTP boundaries — Mongoose owns persistence, Zod owns the API contract.

## Why Zod in `libs/shared/contracts/`

End-to-end type safety with one source of truth. NestJS controllers parse incoming bodies with `nestjs-zod`. The React fetcher parses responses with the same Zod schema. If the backend changes its response, the frontend's parser fails at the boundary, not in some downstream component. Drift is impossible.

## Why pure logic in `libs/`, side effects in `apps/`

Two reasons:

1. **Test surface** — pure functions test in milliseconds, no Nest container, no mongo, no DOM. The Layer 2 budget stays small.
2. **Invariants survive rewrites** — `LOGIC-*` invariants reference functions in `libs/` that are part of the project's stable API. They'd break if the lib was renamed, but not if the React/Nest layer was swapped.

## Why three layers of verification

Speed and signal-to-noise:

- **Layer 1 (lint + types + build)** is sub-second feedback on the most common AI failure modes (wrong import, type mismatch, syntax error).
- **Layer 2 (invariants + units)** is sub-minute feedback on logic and data contracts. This is where the bulk of correctness lives.
- **Layer 3 (browser/Playwright)** is the only place visual and PWA-installable behavior can be checked. It's slow, so it runs on PR, not save.

If we only had Layer 3, the AI would wait 10 minutes per iteration. If we only had Layer 1+2, visual bugs would ship.

## Why categorize invariants by constraint, not feature

Pulled directly from `agentic-dev-days-chess`. A per-feature taxonomy creates a graveyard of dead sections when features get refactored. A constraint-based taxonomy means every invariant has an obvious home and removing a feature never orphans rules. Adopting this from day one is much cheaper than refactoring later.

## Why hard rules exist (and are repeated everywhere)

The biggest failure mode of AI-maintained code is the agent silently weakening the spec to make tests pass. The hard rules in `AGENTS.md` exist to make that drift detectable. CI enforces what it can (gitleaks, test-passes-without-test-edits is enforced via `git diff` checks in workflows we'll add).

## What we're explicitly deferring

- **Authentication implementation** — first feature in the backlog will define this.
- **AI provider choice** — pin when `TASTE-02` lands.
- **Deployment target** — pin when we're ready to push past local + CI.
- **Caching layer (Redis, etc.)** — add when we feel pain.

The principle: pick when the first feature needs it. Premature decisions in an AI-maintained codebase calcify before they're stress-tested.
