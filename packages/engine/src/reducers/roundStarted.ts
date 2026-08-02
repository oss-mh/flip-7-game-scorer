import { DomainError } from "../errors.js";

import type { RoundStartedEvent } from "../events.js";
import type { Player, PlayerId } from "../player.js";
import type { GameState, PlayerRoundState } from "../state.js";

/** The player one seat left of `dealerId` in the fixed seating order. */
function nextDealerId(players: readonly Player[], dealerId: PlayerId): PlayerId {
  const index = players.findIndex((player) => player.id === dealerId);
  if (index === -1) {
    throw new DomainError(`Previous dealer "${dealerId}" is not a player in this game`);
  }
  const next = players[(index + 1) % players.length];
  if (!next) {
    throw new DomainError("Unable to compute the next dealer from an empty player list");
  }
  return next.id;
}

function freshPlayerRoundState(playerId: PlayerId): PlayerRoundState {
  return {
    playerId,
    numberCards: [],
    modifierCards: [],
    heldSecondChance: null,
    status: "active",
  };
}

/**
 * The deck passes one seat left at the end of every round. `state.currentRound`
 * still holds the previous round (RoundClosed doesn't clear it — see #54) so
 * its `dealerId` is the seat to rotate from; on the very first round there's
 * no previous dealer, so the event's choice is trusted as-is.
 */
export function applyRoundStarted(state: GameState, event: RoundStartedEvent): GameState {
  const previousDealerId = state.currentRound?.dealerId ?? null;

  if (previousDealerId === null) {
    if (!state.players.some((player) => player.id === event.dealerId)) {
      throw new DomainError(
        `RoundStarted dealerId "${event.dealerId}" is not a player in this game`,
      );
    }
  } else {
    const expected = nextDealerId(state.players, previousDealerId);
    if (event.dealerId !== expected) {
      throw new DomainError(
        `RoundStarted dealer must rotate one seat left from "${previousDealerId}" to "${expected}", got "${event.dealerId}"`,
      );
    }
  }

  const players: Record<PlayerId, PlayerRoundState> = {};
  for (const player of state.players) {
    players[player.id] = freshPlayerRoundState(player.id);
  }

  const roundNumber = state.roundNumber + 1;

  return {
    ...state,
    roundNumber,
    currentRound: {
      roundNumber,
      dealerId: event.dealerId,
      players,
      cardsDealt: [],
      pendingResolutions: [],
    },
  };
}
