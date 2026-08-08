# Flip 7 Tracker

A local-first web app for scoring games of **Flip 7** — tap the cards as they're dealt and let the app handle the arithmetic, the bust detection and the card counting.

> **Unofficial.** This is a fan-made scorekeeping tool with no affiliation to USAopoly, Inc. Flip 7 is their trademark. You need a copy of the physical game to use this; it does not reproduce the game, its rules text, or its card artwork.

---

## Why this exists

Flip 7 is a press-your-luck game where every decision hinges on two questions: _what's left in the deck_, and _what does my score become if I stop now_. Both are answerable by hand, and both are tedious enough that people stop bothering and play on vibes.

The app removes the arithmetic entirely, and — optionally — surfaces the deck composition the rulebook tells you to keep in your head anyway.

## Status

**Pre-alpha.** Nothing is shippable yet. Work is organised into milestones M0–M10; see [Issues](../../issues) and [Milestones](../../milestones).

| Phase   | Milestones | What lands                                         |
| ------- | ---------- | -------------------------------------------------- |
| Engine  | M0–M2      | Pure rules, scoring, every action-card edge case   |
| Storage | M3         | Repository port, in-memory + localStorage adapters |
| App     | M4–M6      | Board UI, tap-to-deal, scoring, manual entry       |
| Depth   | M7–M9      | Card counter, history, stats, offline PWA          |
| Future  | M10        | Remote storage, multi-device sync                  |

No UI work starts before M4. The rules are settled and tested first.

---

## Architecture

The central decision: **the game is an append-only log of events, folded into state by a pure function.** Not a mutable game object.

```
┌─────────────────────────────────────────────┐
│  apps/web            Next.js App Router     │
│  components, GameProvider, composition root │
└────────────────────┬────────────────────────┘
                     │ depends on (types only)
┌────────────────────▼────────────────────────┐
│  packages/engine    PURE DOMAIN             │
│  cards · events · reduce() · scoreRound()   │
│  legalActions() · ports (interfaces)        │
│  ── zero dependencies, no DOM, no React ──  │
└────────────────────▲────────────────────────┘
                     │ implements ports
┌────────────────────┴────────────────────────┐
│  packages/adapters                          │
│  InMemory · LocalStorage · (later) Http     │
└─────────────────────────────────────────────┘
```

### What event sourcing buys us

- **Undo/redo** — people mistap cards at a real table. This is a headline feature, not a nicety.
- **Replay** — scrub through any game to settle an argument.
- **History and stats** — already in the log; nothing extra to record.
- **Future sync** — an event log with a version number merges across devices. A mutable blob does not.
- **Testability** — the fiddly rules are pure functions over a state object.

### Events record facts, not conclusions

```ts
type GameEvent =
  | { t: "GameCreated"; players: Player[]; targetScore: number }
  | { t: "RoundStarted"; dealerId: string }
  | { t: "CardDealt"; playerId: string; card: Card }
  | { t: "PlayerStayed"; playerId: string }
  | {
      t: "ActionTargeted";
      card: ActionCard;
      sourceId: string;
      targetId: string;
    }
  | { t: "DeckReshuffled" }
  | { t: "ManualScoreEntered"; playerId: string; points: number }
  | { t: "RoundClosed" };
```

Note what's **absent**: no `PlayerBusted`, no `Flip7Achieved`, no `SecondChanceConsumed`. Those are derived by the reducer from `CardDealt`. Rules live in exactly one place, and the deck tracker falls out of the same fold.

`ManualScoreEntered` is the escape hatch: a round can be tracked card-by-card or entered as a plain number, and both feed the same scoreboard.

### The storage port

```ts
export interface GameRepository {
  createGame(game: GameMeta): Promise<void>;
  listGames(): Promise<GameMeta[]>;
  loadEvents(gameId: string, sinceVersion?: number): Promise<StoredEvent[]>;
  appendEvents(
    gameId: string,
    events: GameEvent[],
    expectedVersion: number, // rejects if another device wrote first
  ): Promise<AppendResult>;
  saveSnapshot(
    gameId: string,
    version: number,
    state: GameState,
  ): Promise<void>;
  loadSnapshot(gameId: string): Promise<Snapshot | null>;
  deleteGame(gameId: string): Promise<void>;
}
```

`expectedVersion` is pointless for localStorage — it always succeeds. It exists so that adding a networked adapter later requires no changes above the port. Every adapter must pass the same contract test suite; that suite is what makes swapping storage safe rather than hopeful.

---

## Repository layout

```
apps/web/              Next.js app — App Router, client-heavy (local-first)
packages/engine/       Pure rules, events, scoring, port interfaces
packages/adapters/     Concrete storage implementations
docs/adr/              Architecture decision records
scripts/               Repo tooling, including the issue bootstrap script
supabase/migrations/   SQL migrations for the remote GameRepository (M10)
```

### Two rules that must hold

1. **`packages/engine` never imports React, Next, or anything DOM.** Its `tsconfig` excludes the `DOM` lib, so `window` is a compile error.
2. **`apps/web` never imports a concrete adapter.** Only the port type, resolved at a single composition root.

Both are enforced by lint and fail CI. Break either and the "swap the storage layer later" property quietly dies.

---

## Getting started

**Requires** Node 22.20+ (see `.nvmrc`) and pnpm (version pinned via `packageManager` in `package.json`; run `corepack enable` to get it automatically).

```bash
pnpm install
pnpm dev          # http://localhost:3000
```

| Script            | Does                                        |
| ----------------- | ------------------------------------------- |
| `pnpm dev`        | Run the web app in development              |
| `pnpm build`      | Production build of all workspaces          |
| `pnpm test`       | Run the full test suite                     |
| `pnpm test:watch` | Vitest in watch mode                        |
| `pnpm lint`       | ESLint, including the import-boundary rules |
| `pnpm typecheck`  | `tsc --noEmit` across workspaces            |

---

## Continuous integration

`.github/workflows/ci.yml` runs on every push to `main` and on every pull request: install (pnpm-cached), lint, typecheck, test (with coverage — see [`packages/engine/vitest.config.ts`](./packages/engine/vitest.config.ts) for the threshold), then build. A coverage summary is posted to the job's step summary.

**Branch protection.** `main` should have a protection rule requiring the `Lint, typecheck, test, build` check from this workflow to pass before merging (Settings → Branches → Add rule → Require status checks to pass, select that check; also enable "Require branches to be up to date"). This isn't configured automatically — an admin needs to turn it on once in the repo settings.

---

## Domain glossary

Terms used consistently across code, issues and commits.

| Term                   | Meaning                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------ |
| **Active player**      | Hasn't busted, stayed, or been frozen. Only active players can be dealt cards or targeted. |
| **Bust**               | Drew a duplicate number. Scores 0 for the round, out immediately.                          |
| **Stay**               | Voluntarily banked points and left the round. Legal only with at least one card.           |
| **Frozen**             | Banked and removed from the round by a Freeze card. Scores exactly as a Stay.              |
| **Flip 7**             | Seven _unique number cards_. Ends the round for everyone instantly, +15 points.            |
| **Round score**        | Sum of numbers → ×2 if held → plus flat modifiers → plus 15 if Flip 7.                     |
| **Pending resolution** | An interrupt awaiting input or automatic resolution. Blocks all other moves.               |
| **Fold**               | Replaying an event log through `reduce` to produce current state.                          |

### Rules that are easy to get wrong

These have bitten implementations before. Each has dedicated tests.

- **Scoring order is multiply-then-add.** `(numbers × 2) + modifiers + 15`, never `(numbers + modifiers) × 2`.
- **A lone ×2 with no number cards scores zero.** Other modifiers alone still score.
- **Modifiers never count toward Flip 7.** Only number cards do.
- **Flip Three counts every card type** toward its three — numbers, modifiers and actions alike.
- **Action cards revealed during a Flip Three resolve _after_ all three are drawn** — and only if the player survived.
- **Second Chance is discarded at end of round even if unused.** It never carries over.
- **The game ends at the end of the round** in which someone reaches the target, and the **highest** score wins — not necessarily whoever crossed 200 first.

The physical rulebook (Ruleset Edition 3.1) is the source of truth. Where code and rulebook disagree, the rulebook wins and the code is a bug.

---

## Contributing

Work is issue-driven. Pick something from the current milestone rather than jumping ahead — the ordering reflects real dependencies.

**Labels**

| Prefix            | Values                                                       |
| ----------------- | ------------------------------------------------------------ |
| `type:`           | `feature` `chore` `test` `docs` `bug` `spike`                |
| `area:`           | `engine` `persistence` `ui` `infra` `pwa`                    |
| `prio:`           | `p0` (blocks downstream) `p1` (needed for v1) `p2` (post-v1) |
| `size:`           | `xs` (<1hr) `s` `m` `l` (consider splitting)                 |
| `rules:edge-case` | Touches a fiddly Flip 7 rule interaction                     |

**Before opening a PR**

- [ ] `pnpm lint && pnpm typecheck && pnpm test` all pass
- [ ] Any rules change has a test citing the rulebook page it derives from
- [ ] No new dependencies in `packages/engine`
- [ ] Issue closed via `Closes #N`

Rebuilding the issue backlog from scratch: `./scripts/flip7.sh --dry-run` to preview, then without the flag. It's idempotent and safe to re-run.

---

## Licence

Code is MIT licensed — see [LICENSE](./LICENSE).

Flip 7 is a trademark of USAopoly, Inc. This project is unaffiliated with and unendorsed by them. It contains no card artwork and no reproduction of the rulebook text; it is a scorekeeping aid for people who own the game.
