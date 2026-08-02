import { DomainError } from "../errors.js";
import { scoreRound } from "../scoring.js";
import { isRoundOver } from "../selectors.js";

import { requireCurrentRound } from "./roundHelpers.js";

import type { PlayerId } from "../player.js";
import type { GameState } from "../state.js";

/**
 * Validates the round has genuinely ended, then banks each player's round
 * score into cumulativeScores. Whether the game itself has ended (someone
 * reached the target score) is a separate concern owned by M6 — this
 * doesn't touch GameState.status.
 */
export function applyRoundClosed(state: GameState): GameState {
  const round = requireCurrentRound(state);
  if (!isRoundOver(state)) {
    throw new DomainError("RoundClosed is not valid yet — some players are still active");
  }

  const cumulativeScores: Record<PlayerId, number> = { ...state.cumulativeScores };
  for (const [playerId, playerRoundState] of Object.entries(round.players)) {
    const { total } = scoreRound(playerRoundState);
    cumulativeScores[playerId] = (cumulativeScores[playerId] ?? 0) + total;
  }

  return { ...state, cumulativeScores };
}
