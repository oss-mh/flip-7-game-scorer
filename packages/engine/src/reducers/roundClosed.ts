import { DomainError } from "../errors.js";
import { isRoundOver } from "../selectors.js";

import { requireCurrentRound } from "./roundHelpers.js";

import type { GameState } from "../state.js";

/**
 * Validates that the round has genuinely ended before allowing it to close.
 * Banking each player's score into cumulativeScores happens once
 * scoreRound() lands in #55 — until then this only guards the transition.
 */
export function applyRoundClosed(state: GameState): GameState {
  requireCurrentRound(state);
  if (!isRoundOver(state)) {
    throw new DomainError("RoundClosed is not valid yet — some players are still active");
  }
  return state;
}
