import { DomainError } from "../errors.js";

import type { PlayerId } from "../player.js";
import type { GameState, PlayerRoundState, RoundState } from "../state.js";

export function requireCurrentRound(state: GameState): RoundState {
  if (!state.currentRound) {
    throw new DomainError("No round is currently in progress");
  }
  return state.currentRound;
}

export function requirePlayerRound(round: RoundState, playerId: PlayerId): PlayerRoundState {
  const playerRound = round.players[playerId];
  if (!playerRound) {
    throw new DomainError(`"${playerId}" is not a player in the current round`);
  }
  return playerRound;
}

export function requireActivePlayerRound(round: RoundState, playerId: PlayerId): PlayerRoundState {
  const playerRound = requirePlayerRound(round, playerId);
  if (playerRound.status !== "active") {
    throw new DomainError(
      `Player "${playerId}" cannot act — status is "${playerRound.status}", not active`,
    );
  }
  return playerRound;
}

export function withCurrentRound(state: GameState, round: RoundState): GameState {
  return { ...state, currentRound: round };
}
