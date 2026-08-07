import { fold } from "./reduce.js";
import { roundHistory } from "./roundHistory.js";
import { scoreRound } from "./scoring.js";
import { gameWinners } from "./selectors.js";

import type { GameEvent } from "./events.js";
import type { PlayerRoundState } from "./state.js";

export interface PlayerLifetimeStats {
  readonly name: string;
  readonly gamesPlayed: number;
  readonly wins: number;
  readonly roundsPlayed: number;
  readonly bustCount: number;
  /** 0 when `roundsPlayed` is 0, not `NaN`. */
  readonly bustRate: number;
  /** 0 when `roundsPlayed` is 0, not `NaN`. Busted and manual rounds are included — a bust counts as 0, a manual round counts at its entered score. */
  readonly averageRoundScore: number;
  readonly flip7Count: number;
  /** Cards held on the rounds a player chose to stay, averaged — `null` if they never once stayed (always busted, flipped 7, was manually scored, or has no rounds at all). */
  readonly averageHitsBeforeStaying: number | null;
}

interface Accumulator {
  name: string;
  gamesPlayed: number;
  wins: number;
  roundsPlayed: number;
  bustCount: number;
  flip7Count: number;
  scoreSum: number;
  stayedRounds: number;
  hitsSum: number;
}

function cardsHeld(playerRound: PlayerRoundState): number {
  return playerRound.numberCards.length + playerRound.modifierCards.length;
}

/**
 * Lifetime per-player totals across every stored game, one entry per unique
 * player *name*. `PlayerId` is scoped to a single game — there's no
 * cross-game player identity anywhere in this domain — so "the same
 * player" is necessarily approximated by exact name match: a rename shows
 * up as a new entry, and two different people sharing a name merge into
 * one. See docs/adr/0003-lifetime-stats-identity-by-name.md for why that
 * tradeoff was accepted rather than inventing a player-identity concept
 * this milestone doesn't otherwise need.
 *
 * `games` is every stored game's full event log, already loaded by the
 * caller — this stays a pure function of data handed to it (AGENTS.md
 * invariant #1/#2: no IO, no non-determinism in the engine). Computed
 * fresh on every call; add caching above this if it ever proves too slow
 * in practice; nothing here does today.
 */
export function lifetimePlayerStats(
  games: readonly (readonly GameEvent[])[],
): readonly PlayerLifetimeStats[] {
  const byName = new Map<string, Accumulator>();

  function accumulatorFor(name: string): Accumulator {
    const existing = byName.get(name);
    if (existing) return existing;
    const created: Accumulator = {
      name,
      gamesPlayed: 0,
      wins: 0,
      roundsPlayed: 0,
      bustCount: 0,
      flip7Count: 0,
      scoreSum: 0,
      stayedRounds: 0,
      hitsSum: 0,
    };
    byName.set(name, created);
    return created;
  }

  for (const events of games) {
    if (events.length === 0) continue;
    const state = fold(events);
    const winnerIds = new Set(gameWinners(state));

    for (const player of state.players) {
      const accumulator = accumulatorFor(player.name);
      accumulator.gamesPlayed += 1;
      if (winnerIds.has(player.id)) accumulator.wins += 1;
    }

    for (const entry of roundHistory(events)) {
      for (const player of state.players) {
        const playerRound = entry.round.players[player.id];
        if (!playerRound) continue;

        const accumulator = accumulatorFor(player.name);
        accumulator.roundsPlayed += 1;
        accumulator.scoreSum += scoreRound(playerRound).total;
        if (playerRound.status === "busted") accumulator.bustCount += 1;
        if (playerRound.status === "flipped7") accumulator.flip7Count += 1;
        if (playerRound.status === "stayed") {
          accumulator.stayedRounds += 1;
          accumulator.hitsSum += cardsHeld(playerRound);
        }
      }
    }
  }

  return Array.from(byName.values())
    .map(
      (accumulator): PlayerLifetimeStats => ({
        name: accumulator.name,
        gamesPlayed: accumulator.gamesPlayed,
        wins: accumulator.wins,
        roundsPlayed: accumulator.roundsPlayed,
        bustCount: accumulator.bustCount,
        bustRate: accumulator.roundsPlayed > 0 ? accumulator.bustCount / accumulator.roundsPlayed : 0,
        averageRoundScore:
          accumulator.roundsPlayed > 0 ? accumulator.scoreSum / accumulator.roundsPlayed : 0,
        flip7Count: accumulator.flip7Count,
        averageHitsBeforeStaying:
          accumulator.stayedRounds > 0 ? accumulator.hitsSum / accumulator.stayedRounds : null,
      }),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
}
