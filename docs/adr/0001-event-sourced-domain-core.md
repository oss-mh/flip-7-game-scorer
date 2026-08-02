# ADR-0001: Event-sourced domain core

**Status:** Accepted

## Context

The game state (players, hands, scores, whose turn it is) could be modelled as a single mutable object that each action updates in place — the obvious, conventional choice for a scorekeeping app.

But a few requirements keep coming back to the same underlying need:

- **Undo.** People mistap cards at a physical table constantly — this is the headline feature, not a nicety. Undo on a mutable object means either deep-cloning state before every action (expensive, easy to forget) or writing a bespoke inverse for every action (doubles the surface area of every rule).
- **Replay.** Being able to scrub through a past game to settle an argument about what happened, or to reproduce a bug report exactly, requires the full history to exist somewhere — not just the current state.
- **History and stats** (M8) need per-round, per-action detail that a mutable object throws away the moment it's overwritten.
- **Future multi-device sync** (M10) needs something that can merge across devices. A mutable blob has no way to reconcile two devices' concurrent edits; a log with a version number does.

## Decision

The game is modelled as an append-only log of `GameEvent`s, folded through a pure `reduce(events) => GameState` function. This is `packages/engine`'s central data structure.

Events record **facts** — what happened at the physical table — never **conclusions** derived from those facts. So `CardDealt` is an event; `PlayerBusted` is not, because busting is something the reducer works out from the sequence of `CardDealt` events, not something a player does. (See AGENTS.md, "Events record what happened, not what it means," for the full rule and worked examples.)

Corrections are new events appended to the log, or an explicit truncation via the undo path — the log itself is never mutated or rewritten in place to fix a bad state. If replaying the log produces the wrong state, the reducer has a bug; the fix is to the reducer, not the stored events.

## Consequences

- Undo/redo falls out of the log for free: truncate to an earlier version and re-fold. No bespoke inverse-action code per rule.
- Replay, history, and lifetime stats need no separate recording mechanism — they're all just folds (or partial folds) over the same log that already exists for gameplay.
- Testing the rules means testing a pure function over a list of events, with no mocking, no setup/teardown of mutable fixtures, and no risk of tests depending on unreachable hand-built state (see AGENTS.md, "Prefer testing through `fold(events)`").
- Every state change needs an event definition and a reducer case, even ones that would be a one-line mutation on a plain object — more upfront ceremony per rule.
- Keeping events fact-based rather than conclusion-based takes discipline; it's easy to accidentally reach for a `PlayerBusted`-shaped event under time pressure. This is a review-time invariant, not something the type system alone enforces.
- Sets up M10 (remote sync) cheaply: an event log with a version number is mergeable across devices in a way a mutable snapshot is not, so that milestone doesn't require revisiting this decision.
