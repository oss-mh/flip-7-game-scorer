<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

Guidance for Claude Code working in this repository. Read [README.md](./README.md) first for architecture; this file covers _how to work here_.

---

## The one-paragraph version

This is a local-first Flip 7 scorekeeper built on an append-only event log folded by a pure reducer. The domain package is dependency-free and framework-free, storage sits behind a port, and the rulebook is the source of truth for behaviour. Most mistakes in this codebase come from putting logic in the wrong layer or guessing at a rule instead of checking it.

---

## Non-negotiable invariants

Violating any of these is a bug even if tests pass and the feature works.

### 1. `packages/engine` stays pure

No React, no Next, no `window`, no `document`, no `fetch`, no runtime dependencies. Its `tsconfig` excludes the `DOM` lib, so most violations won't compile — but don't route around that with `declare global` or `@ts-expect-error`.

### 2. No non-determinism in the domain

Never call `Date.now()`, `Math.random()`, `crypto.randomUUID()` or `new Date()` inside the engine. Take a `Clock`, `IdGenerator` or `Shuffler` port. Tests depend on replaying a log producing byte-identical state.

### 3. Events record what happened, not what it means

If you're adding an event named after a _conclusion_ — `PlayerBusted`, `Flip7Achieved`, `SecondChanceConsumed`, `RoundWon` — stop. That belongs in the reducer as derived state.

Ask: _did someone at the physical table do this, or is it something we worked out?_ Only the former is an event.

### 4. The event log is append-only

Never mutate or delete a stored event to fix state. Corrections are new events, or an explicit log truncation via the undo path. If state is wrong, the reducer is wrong.

### 5. Rules live in the engine, never in components

A component must never decide whether a move is legal, whether a player busted, or what a score is. It calls `legalActions()`, reads state, and renders. If you find yourself writing `if (player.numberCards.length === 7)` in a `.tsx` file, that logic belongs in a selector.

### 6. `apps/web` never imports a concrete adapter

Only the port type, resolved at the single composition root. Lint enforces this.

---

## Before changing any rule behaviour

1. **Check the rulebook.** Ruleset Edition 3.1. If it isn't to hand, ask — do not infer the rule from the existing code, because the existing code may be what's wrong.
2. **Write the failing test first**, and reference the rulebook page in a comment.
3. **Check the edge-case matrix** (`packages/engine/src/__tests__/edge-cases/`) for an existing case that contradicts your change.
4. If the rulebook is genuinely ambiguous, **stop and ask rather than picking an interpretation.** Record the resolution in `docs/adr/`.

### Rules most often implemented wrongly

Check these against your change before submitting.

- **Scoring order:** `(sum of numbers × 2) + flat modifiers + 15`. Never add modifiers before multiplying.
- **A lone ×2 card with no number cards scores 0.** Other modifiers alone still score their face value.
- **Modifiers and action cards never count toward Flip 7.** Only seven unique _number_ cards.
- **Flip Three counts all card types** toward its three draws — numbers, modifiers and actions.
- **Actions revealed mid-Flip-Three queue and resolve after all three land**, and only if the player didn't bust.
- **Second Chance:** one per player; a duplicate is passed to another active player without one, or discarded if nobody qualifies; all copies discard at round end whether used or not.
- **The 0 card is a normal number card** worth no points, and it can be duplicated into a bust.
- **Game end:** triggered at _round close_, not mid-round. Highest cumulative score wins, which is not necessarily whoever first crossed the target.

---

## Working agreements

### Scope

Work one issue at a time. If you discover adjacent problems, note them and ask — don't fold three fixes into one change. Issues are deliberately bite-sized and their ordering encodes real dependencies; if an issue seems to require something from a later milestone, say so rather than building the later thing early.

### Tests

- Every rules change needs a test. Non-negotiable.
- Engine coverage threshold is **95%**; app code is lower and that's fine.
- Prefer testing through `fold(events)` rather than constructing state objects by hand — hand-built state can be unreachable in a real game and lets bugs hide.
- New edge cases go in the edge-case matrix with a rulebook citation.

### TypeScript

- `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` are on. Leave them on.
- No `any`. No non-null `!` assertions in the engine — narrow properly.
- Exhaustive switches use a `never` guard so a new event type fails to compile until handled everywhere.
- Domain state is readonly. Reducers return new objects.

### Commits and PRs

- Conventional commits, scoped: `feat(engine): implement Freeze targeting rules`
- One logical change per commit
- PR description states what changed, what the rulebook says, and how it was tested
- Close issues with `Closes #N`

### Don't

- Don't add dependencies to `packages/engine`. Ever.
- Don't add a dependency anywhere else without asking.
- Don't reproduce rulebook text or card artwork in the repo — this is an unofficial tool and it stays that way.
- Don't use `localStorage` directly outside the adapter.
- Don't disable a lint rule to make something pass. The import-boundary rules in particular exist to protect the architecture.
- Don't reformat or restructure files you weren't asked to touch.

---

## Useful commands

```bash
pnpm test --filter engine     # fastest feedback loop; most work lives here
pnpm test:watch               # Vitest watch mode
pnpm lint                     # includes architectural import boundaries
pnpm typecheck                # tsc --noEmit across workspaces
pnpm dev                      # web app on :3000
```

Fastest way to reproduce a reported bug: get the exported event log from the user (Settings → Export), drop it into `packages/engine/src/__tests__/fixtures/`, and fold it. An exported log reproduces a bug exactly — that's most of the reason export exists.

---

## Design priorities, in order

When a trade-off comes up, resolve it in this order:

1. **Never lose someone's scores.** A crash mid-game with no recovery path is the worst outcome this app has. Prefer degraded function over data loss.
2. **Correctness of the rules.** A tracker that scores wrong is worse than no tracker.
3. **Speed at the table.** This is used between turns of a live game. Every extra tap is real friction.
4. **Readability at arm's length.** Phones sit on tables in dim rooms.
5. **Everything else.**

Anything at (1) or (2) beats anything at (3) or below. Don't trade correctness for convenience.

---

## Context that isn't obvious from the code

- **Why `expectedVersion` on a localStorage adapter that can never conflict?** It's the seam that lets a networked adapter drop in later without changes above the port. Don't remove it as dead code.
- **Why event sourcing for a card game?** Undo is the real driver. People mistap at a physical table constantly, and undo on a mutable state object is a rewrite.
- **Why is the card counter optional?** Some tables consider it cheating. Purist mode is a real requirement, not a toggle for its own sake.
- **Why is manual score entry a first-class mode?** Some groups want to play at full speed and just record results. It must not feel like a degraded fallback.
