import { DomainError } from "../errors.js";

import { requireActivePlayerRound, requireCurrentRound, withCurrentRound } from "./roundHelpers.js";

import type { PlayerStayedEvent } from "../events.js";
import type { GameState, PlayerRoundState, RoundState } from "../state.js";

/**
 * Banking a round's score is scoreRound()'s job (#55) — this handler only
 * needs to flip status to "stayed", which is what makes a player eligible
 * to be scored instead of zeroed, and takes them out of the active set so
 * they can no longer be dealt to or targeted.
 */
export function applyPlayerStayed(state: GameState, event: PlayerStayedEvent): GameState {
  const round = requireCurrentRound(state);
  const playerRound = requireActivePlayerRound(round, event.playerId);

  if (playerRound.numberCards.length === 0 && playerRound.modifierCards.length === 0) {
    throw new DomainError(`Player "${event.playerId}" cannot stay with no cards in front of them`);
  }

  const updatedPlayerRound: PlayerRoundState = { ...playerRound, status: "stayed" };

  const updatedRound: RoundState = {
    ...round,
    players: { ...round.players, [event.playerId]: updatedPlayerRound },
  };

  return withCurrentRound(state, updatedRound);
}
