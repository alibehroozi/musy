---
epic: explore
status: pending
estimated-invariants: 7
---

# Feature 04: Taste profile and Anthropic LLM scaffolding

## Product description

Build a structured taste profile per user from their swipes + listening events using Anthropic Claude Sonnet 4.6. The profile holds: genres ranked (with affinity scores), artists ranked (with affinity scores), tempo bucket (slow / mid / fast), remix preference (original / remix-friendly / remix-only), plus a short natural-language summary the LLM produces. Rebuilt every K=20 swipes or every 24 h since last build, whichever first.

`GET /api/explore/profile` returns the user's current profile (or `null` if too few swipes yet). Feature 5 (queue) consumes it; the future Taste tab will too.

This is the **first AI feature in the codebase**. It establishes:

- The Anthropic SDK setup pattern (config service binding, prompt-cache key derivation, error → `AllExceptionsFilter` mapping)
- The first `AI-*` invariants — the section in `INVARIANTS.md` is empty today
- The first prompt that contains user-derived data — the privacy posture must be pristine because every later AI feature copies from this template

The build runs as a post-write check inside the `/swipe` handler — if a rebuild is due, the work is enqueued (a Promise the request response doesn't wait on) so the user's swipe stays low-latency. The handler returns 204 immediately; the rebuild lives in a fire-and-forget Promise with structured logging on success / failure (no toast, no UI surface). On API restart, an in-flight job is lost — acceptable because the next swipe re-checks the rebuild condition and triggers a fresh job.

## User behavior

Backend feature with one user-observable side effect (until feature 5 / future Taste tab consumes it): after swiping ~20 times, `GET /api/explore/profile` returns a populated profile.

Manual exercise:

1. Sign in.
2. Submit 1–5 right-swipes on different snapshots → `GET /api/explore/profile` returns 200 with `null` (below threshold).
3. Submit 20 swipes total → on swipe #20, the build kicks off (visible as a structured log line `taste_profile_build_started`); shortly after, a `taste_profile_build_completed` line; `GET /api/explore/profile` now returns a populated profile.
4. Inspect Mongo Express → `taste_profiles` has one doc with `userId, genres, artists, tempoBucket, remixPreference, summaryText, lastBuiltAt, swipeCountAtLastBuild`.
5. Submit 19 more swipes → no rebuild yet (count < 40, < 24 h since last). Submit swipe #40 → rebuild triggers.
6. Wait > 24 h, submit one swipe → rebuild triggers (time-based path).

**Failure modes:**

- Anthropic API error (auth, rate limit, 5xx) → build fails; `lastBuiltAt` not updated; structured log line `taste_profile_build_failed` with the error code; the next eligible swipe retries. The user-facing endpoint never blocks on the LLM.
- Anthropic response fails Zod → same as above; we have a stable schema for the model's output.
- Prompt size exceeds budget → truncation policy applied (newest-first; oldest swipes dropped).

**Empty / first-run state:** `GET /api/explore/profile` returns 200 with `null` for users with < 20 total swipes. Feature 5 / Taste tab handle `null` gracefully.

## Design

**Visual mockup:** none — backend feature.
**DS components used:** none.
**DS components required but missing:** none.
**Layout notes:** none.

## Backend

**New endpoints:**

- `GET /api/explore/profile` (auth-required) — returns 200 with the user's current profile or `null`. Body matches the `TasteProfileResponse` Zod schema.

**New / changed Mongoose collections:**

- `taste_profiles` (new) — fields:
  - `id: string` (uuid v4)
  - `userId: string` — **unique** index
  - `genres: { name: string, score: number }[]` — sorted by score descending
  - `artists: { name: string, score: number }[]` — sorted by score descending
  - `tempoBucket: "slow" | "mid" | "fast" | null`
  - `remixPreference: "original" | "remix-friendly" | "remix-only" | null`
  - `summaryText: string` — short LLM-produced description, < 500 characters
  - `lastBuiltAt: Date`
  - `swipeCountAtLastBuild: number`

- `swipes` (existing, from feature 3): unchanged. Reads only.
- `listening_events` (existing): reads only — the build prompt includes recent listening behavior alongside swipes for richer signal.

**Build trigger:** in `explore.service.ts` (introduced in feature 3), after a successful `POST /swipe` write, check the user's `taste_profiles` doc:

- If no profile exists and `totalSwipes >= 20` → enqueue build.
- If profile exists and `(totalSwipes - swipeCountAtLastBuild >= 20)` OR `(now - lastBuiltAt > 24 h)` → enqueue build.

The enqueue is `void buildTasteProfile(userId).catch(logErr)` — no in-process queue lib needed for v1.

**Build pipeline (in `apps/api/src/modules/explore/profile-builder.service.ts`):**

1. Read most-recent N=200 swipes for the user (newest-first).
2. Read most-recent M=100 `listening_events` (newest-first; both `started` and `completed`).
3. Read the previous profile's `summaryText` (so the model can incrementally refine).
4. Compose the prompt — see "Prompt shape" below.
5. Call `anthropic.messages.create(...)` with `model: "claude-sonnet-4-6"`, prompt caching enabled on the system prompt, `max_tokens: 2048`.
6. Parse the response against a Zod schema (`TasteProfileLLMOutput`); on parse failure, fall back to the previous profile and log.
7. Upsert into `taste_profiles`.

**Prompt shape (system + user messages):**

System prompt (cached): instructions + output schema example, **no per-user data**.

User message (not cached): JSON-encoded `{ recentSwipes: [{title, artist, direction, at}], recentListens: [{title, artist, kind, completed}], previousSummary: string | null }`. **No `userId`, no `email`, no IP, no session token.**

**New env vars:**

- `ANTHROPIC_API_KEY` — already present in `apps/api/.env.example` per `ARCHITECTURE.md` § Configuration; verify the placeholder is committed and `/prepare-local` mentions it.
- `ANTHROPIC_MODEL` — optional, defaults to `claude-sonnet-4-6`. Lets us bump models without code changes. Add to `apps/api/.env.example` with the default in a comment.

Per AGENTS.md hard rule #9, any new env var cascades to four places: `apps/api/.env.example`, `.claude/commands/prepare-local.md`, `.github/workflows/auto-feature.yml`, `.github/workflows/claude-respond.yml`.

## Tooling

**New deps:**

- **`@anthropic-ai/sdk`** (MIT, official) — TypeScript SDK with built-in prompt-caching helpers, retries, and typed message types. Considered: raw `fetch` against the REST API (loses caching helpers + typed messages; error-handling wheel re-invented), `openai` SDK (wrong vendor), `@google/generative-ai` (wrong vendor). User pre-authorized Anthropic in epic planning.

**External services:**

- **Anthropic API** — paid, user-supplied key. With Sonnet 4.6 + prompt caching, per-call cost ~$0.001. Per-user/day budget < $0.05 at our trigger cadence (1 call per 20 swipes; very few users will swipe more than ~1k/day).

## Privacy

The privacy posture here is the template for every later AI feature. Be precise:

- User → API: no new user-supplied data on `GET /profile`; the input to the build job is the user's own swipes + listening events read from our DB.
- API → Anthropic prompt: `{ recentSwipes, recentListens, previousSummary }` only. **Specifically excluded:** `userId`, `email`, IP, session cookie / token, any field outside the explicit list.
- API → LLM through SDK: the SDK adds its own `User-Agent`; no extra moc-side identifying headers.
- API → Anthropic for prompt-cache keying: the SDK derives a cache key from the system prompt + user-message bytes — that key MUST NOT include `userId`. Use the system prompt + the deterministic input bytes.
- Stays server-only: every `taste_profiles` doc, the API key, the SDK config.

## Acceptance criteria

- [ ] `GET /api/explore/profile` returns 401 + `ErrorResponse` without a session cookie.
- [ ] `GET /api/explore/profile` returns 200 with `null` for a user with < 20 total swipes.
- [ ] Submitting the 20th swipe triggers a build (visible in logs); afterwards `GET /api/explore/profile` returns a profile matching `TasteProfileResponse`.
- [ ] The next 19 swipes do **not** trigger a rebuild (build cadence respected).
- [ ] A simulated Anthropic 5xx error (mock the client per AGENTS.md hard rule #15 — auth-clients exception applies; document the mock in the test file with a quoted reason from this spec) leaves the existing profile intact and logs `taste_profile_build_failed`.
- [ ] No outgoing Anthropic request body contains the substring of the user's `userId` or `email` (assert via test fixture capturing the SDK's outgoing payload).
- [ ] The prompt-cache key is identical for two users with identical recent-swipe + listen + previous-summary inputs (the key derives from the input bytes, not the user identity).
- [ ] Submitting > 200 swipes preserves the cap (the prompt only sees the most-recent 200; older entries are dropped).

## Suggested invariants

The agent in `/new-invariant` will refine these — they're seeds, not commitments:

- **AI-XX (first in the section!):** The Anthropic prompt body for taste-profile builds never contains the user's `userId`, `email`, IP, or session token. (The test reads the SDK's outgoing request body via a recording fixture and asserts the absence.)
- **AI-XX:** The prompt-cache key for taste-profile builds depends only on the system prompt + the deterministic user-message JSON bytes — two users with identical inputs derive identical cache keys.
- **AI-XX:** The user-message prompt is bounded: at most N=200 swipes + M=100 listens + ≤ 4 KB of `previousSummary`. Inputs above the limit are truncated newest-first.
- **DATA-XX:** Every `taste_profiles` document has `userId, lastBuiltAt, swipeCountAtLastBuild`; `userId` is unique in the collection.
- **API-XX:** `GET /api/explore/profile` returns 401 + `ErrorResponse` without a session; with a session it returns 200 with a body matching `TasteProfileResponse` (which is `Profile | null`).
- **SEC-XX:** `GET /api/explore/profile` for user A never returns user B's profile; the repository scopes all reads by the authenticated `userId` (extends `SEC-06`).
- **PRIVACY-XX:** The taste-profile build prompt's user message is a function only of `(recentSwipes, recentListens, previousSummary)` from our DB — no fields outside that set ever appear in any prompt body.

## Implementation hint for /new-feature

This file is self-contained.

**Where things live (per ARCHITECTURE.md layering):**

- Contracts in `libs/shared/contracts/src/explore.ts`:
  - `TasteProfile` Zod schema for the persisted shape
  - `TasteProfileResponse = TasteProfile.nullable()`
  - `TasteProfileLLMOutput` for the model's response shape (parsed via `JSON.parse` of the message text)
- Pure logic in `libs/api/core/explore/`:
  - `taste-prompt.ts` — `buildTastePrompt({ recentSwipes, recentListens, previousSummary }) → { system, userMessage }`. Pure: no `Date.now()`, no SDK calls. Deterministic.
  - `taste-prompt.test.ts` — unit tests for: prompt-bounds (N=200 / M=100 / 4 KB summary), absence of identity fields in the produced strings, deterministic output for identical inputs.
- NestJS module: extend `apps/api/src/modules/explore/`:
  - `explore.controller.ts` — add `GET /profile`.
  - `profile-builder.service.ts` — orchestrates read → prompt → SDK call → parse → upsert.
  - `anthropic.client.ts` — thin wrapper around `@anthropic-ai/sdk`, injected via `useFactory` reading `ANTHROPIC_API_KEY` via `ConfigService.getOrThrow`.
  - `taste-profile.schema.ts` — Mongoose schema for `taste_profiles`.
  - `taste-profile.repository.ts`.
- `apps/api/.env.example`: confirm `ANTHROPIC_API_KEY=` exists; add `ANTHROPIC_MODEL=` (optional, with default).
- Update `.claude/commands/prepare-local.md`, `.github/workflows/auto-feature.yml`, `.github/workflows/claude-respond.yml` per AGENTS.md hard rule #9 if any new env var lands.

**Real-upstream policy (per AGENTS.md hard rule #15):**

- The Anthropic client tests _do_ hit the real API by default, with retries on transient errors. Cost per CI run is < $0.01.
- The 5xx-failure test is the rare case that mocks the client — quote this paragraph in the test as the override reason:

  > "feat-04 spec authorizes mocking the Anthropic client for the 5xx-failure-mode test specifically, because forcing a 5xx live is unreliable in CI."

**Suggested commit order:**

1. `spec: add AI-XX (×3), DATA-XX, API-XX, SEC-XX, PRIVACY-XX invariants for taste profile`
2. `test(invariants): stub the new invariants it.todo`
3. `feat(contracts): add TasteProfile and related Zod schemas`
4. `feat(api-core): add buildTastePrompt + tests`
5. `feat(api): add anthropic client + profile-builder service + GET /profile route`
6. tests turning `it.todo` into real assertions
7. `chore: env / prepare-local / workflow seeds for ANTHROPIC_MODEL` (if added)
