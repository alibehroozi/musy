---
description: Run the local verification pipeline and summarize failures
---

# Run verify

Run the layered verification pipeline locally and produce a tight summary the user can act on.

## Steps

1. Run `npm run verify` (lint + typecheck + tests).
2. If anything fails, run the failing layer in isolation to get clearer output:
   - Lint failures → `npm run lint`
   - Type failures → `npm run typecheck`
   - Test failures → `npm run test:invariants` (or `npm run test`)
3. Summarize:
   - **Green:** "Layer 1 + 2 passed" + the test count.
   - **Red:** for each failure, give the file:line, the failing invariant ID (if a test), and the smallest possible diff to fix the **source** (not the test). Remember the hard rule: tests encode the spec.

## Output format

```
✅ Layer 1: lint, types, build
❌ Layer 2: 1 invariant failing

  DATA-02 in tests/invariants/data/users.test.ts:42
  expected: createdAt was a Date
  actual:   undefined

  Likely fix: apps/api/src/modules/users/user.schema.ts — the `default: () => new Date()`
  was removed in a recent edit. Restore it.
```

Keep it scannable. The user wants to know what to fix, not what passed.
