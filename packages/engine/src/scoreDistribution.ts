import { fold } from "./reduce.js";
import { roundHistory } from "./roundHistory.js";
import { scoreRound } from "./scoring.js";

import type { GameEvent } from "./events.js";

/**
 * Every round score a player has ever scored, across every stored game, in
 * game-then-round order — the raw values a score-distribution chart needs,
 * as opposed to `lifetimePlayerStats`'s `averageRoundScore`, which already
 * threw that detail away. Same exact-name identity caveat as
 * `lifetimePlayerStats` — see docs/adr/0003.
 */
export function playerRoundScores(
  name: string,
  games: readonly (readonly GameEvent[])[],
): readonly number[] {
  const scores: number[] = [];

  for (const events of games) {
    if (events.length === 0) continue;
    const state = fold(events);
    const matchingPlayers = state.players.filter((player) => player.name === name);
    if (matchingPlayers.length === 0) continue;

    for (const entry of roundHistory(events)) {
      for (const player of matchingPlayers) {
        const playerRound = entry.round.players[player.id];
        if (playerRound) scores.push(scoreRound(playerRound).total);
      }
    }
  }

  return scores;
}
