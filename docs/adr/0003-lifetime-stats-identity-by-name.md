# ADR-0003: Lifetime stats identify a player by exact name match

**Status:** Accepted

## Context

M8 (#42) asks for lifetime player statistics aggregated "by player identity" across every stored game, and explicitly calls out handling "name changes and merged player identities." But `PlayerId` (see `packages/engine/src/player.ts`) is generated fresh per game — there's no concept anywhere in this domain of a player that persists *across* games. There's no player registry, no rename event, no merge event, and no login/account system this app could hang an identity on; the new-game screen's "recent names" quick-add is the only existing precedent, and it already treats identity as "the string you typed."

Building a real cross-game identity model (a `PlayerProfile` concept, a rename event, a manual merge UI for "these two were actually the same person") is a substantially bigger piece of work than a size:m aggregation issue, and nothing else in this milestone or the next needs it yet.

## Decision

`lifetimePlayerStats` (`packages/engine/src/lifetimeStats.ts`) aggregates by exact, case-sensitive `Player.name` match across every game handed to it. Two players named "Alex" in different games are treated as the same player and merged into one entry; a player renamed between games shows up as two separate entries, one per name.

## Consequences

- Simple, no new engine concepts, and no schema or event changes — every existing stored game already has everything this needs.
- A genuine rename ("Alex" becomes "Alexandra") silently splits that player's history into two entries rather than merging it, understating their lifetime totals. There's no UI-level correction for this yet.
- Two different people who happen to share a name (or a typo that happens to match an existing name) silently merge into one entry, overstating that entry's totals. Also no UI-level correction yet.
- If this turns out to matter in practice, the fix is a real identity concept — a stable id independent of any one game's `PlayerId`, assigned at creation and reused by name-suggestion, with an explicit rename/merge action — not a smarter string-matching heuristic layered on top of name equality.
