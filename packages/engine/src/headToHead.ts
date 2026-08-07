import { fold } from "./reduce.js";
import { roundHistory } from "./roundHistory.js";
import { scoreRound } from "./scoring.js";

import type { GameEvent } from "./events.js";
import type { Player } from "./player.js";
import type { GameState } from "./state.js";

export interface HeadToHeadStats {
  readonly playerA: string;
  readonly playerB: string;
  readonly gamesTogether: number;
  /** Games where the named player's final cumulative score was strictly higher — not necessarily the game's overall winner in a 3+ player game. */
  readonly gameWinsA: number;
  readonly gameWinsB: number;
  readonly gameTies: number;
  readonly roundsCompared: number;
  readonly roundWinsA: number;
  readonly roundWinsB: number;
  readonly roundTies: number;
  /** 0 when `roundsCompared` is 0, not `NaN`. */
  readonly averageRoundScoreA: number;
  readonly averageRoundScoreB: number;
}

/** Sum of `state.cumulativeScores` for every player matching `name` — see the exact-name-match caveat in docs/adr/0003. */
function cumulativeScoreFor(state: GameState, matchingPlayers: readonly Player[]): number {
  return matchingPlayers.reduce((sum, player) => sum + (state.cumulativeScores[player.id] ?? 0), 0);
}

/**
 * Head-to-head record between two players by name, across every stored
 * game where both appear. "Game wins" compares final cumulative score
 * between just these two — in a game with a third player, that's not
 * necessarily who the engine's own `gameWinners` declared the overall
 * winner, which is the point of a head-to-head view: it isolates these two
 * from the rest of the table.
 */
export function headToHead(
  playerA: string,
  playerB: string,
  games: readonly (readonly GameEvent[])[],
): HeadToHeadStats {
  let gamesTogether = 0;
  let gameWinsA = 0;
  let gameWinsB = 0;
  let gameTies = 0;
  let roundsCompared = 0;
  let roundWinsA = 0;
  let roundWinsB = 0;
  let roundTies = 0;
  let scoreSumA = 0;
  let scoreSumB = 0;

  for (const events of games) {
    if (events.length === 0) continue;
    const state = fold(events);
    const playersA = state.players.filter((player) => player.name === playerA);
    const playersB = state.players.filter((player) => player.name === playerB);
    if (playersA.length === 0 || playersB.length === 0) continue;

    gamesTogether += 1;
    const cumulativeA = cumulativeScoreFor(state, playersA);
    const cumulativeB = cumulativeScoreFor(state, playersB);
    if (cumulativeA > cumulativeB) gameWinsA += 1;
    else if (cumulativeB > cumulativeA) gameWinsB += 1;
    else gameTies += 1;

    for (const entry of roundHistory(events)) {
      const roundScoreFor = (players: readonly Player[]): number =>
        players.reduce((sum, player) => {
          const playerRound = entry.round.players[player.id];
          return playerRound ? sum + scoreRound(playerRound).total : sum;
        }, 0);

      const scoreA = roundScoreFor(playersA);
      const scoreB = roundScoreFor(playersB);
      roundsCompared += 1;
      scoreSumA += scoreA;
      scoreSumB += scoreB;
      if (scoreA > scoreB) roundWinsA += 1;
      else if (scoreB > scoreA) roundWinsB += 1;
      else roundTies += 1;
    }
  }

  return {
    playerA,
    playerB,
    gamesTogether,
    gameWinsA,
    gameWinsB,
    gameTies,
    roundsCompared,
    roundWinsA,
    roundWinsB,
    roundTies,
    averageRoundScoreA: roundsCompared > 0 ? scoreSumA / roundsCompared : 0,
    averageRoundScoreB: roundsCompared > 0 ? scoreSumB / roundsCompared : 0,
  };
}
