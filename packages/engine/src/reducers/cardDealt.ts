import { DomainError } from "../errors.js";

import {
  requireActivePlayerRound,
  requireCurrentRound,
  withCurrentRound,
} from "./roundHelpers.js";

import type { CardDealtEvent } from "../events.js";
import type { GameState, PlayerRoundState, RoundState } from "../state.js";

export function applyCardDealt(state: GameState, event: CardDealtEvent): GameState {
  const round = requireCurrentRound(state);
  const playerRound = requireActivePlayerRound(round, event.playerId);

  switch (event.card.kind) {
    case "number": {
      const card = event.card;
      const isDuplicate = playerRound.numberCards.some(
        (existing) => existing.value === card.value,
      );

      const updatedPlayerRound: PlayerRoundState = {
        ...playerRound,
        numberCards: [...playerRound.numberCards, card],
        status: isDuplicate ? "busted" : "active",
      };

      const updatedRound: RoundState = {
        ...round,
        players: { ...round.players, [event.playerId]: updatedPlayerRound },
        cardsDealt: [...round.cardsDealt, card],
      };

      return withCurrentRound(state, updatedRound);
    }
    case "modifier": {
      const card = event.card;

      // Modifiers can never bust a player — not even a second copy of the
      // same modifier — and they don't count toward the seven unique
      // numbers needed for Flip 7, since they live in their own row.
      const updatedPlayerRound: PlayerRoundState = {
        ...playerRound,
        modifierCards: [...playerRound.modifierCards, card],
      };

      const updatedRound: RoundState = {
        ...round,
        players: { ...round.players, [event.playerId]: updatedPlayerRound },
        cardsDealt: [...round.cardsDealt, card],
      };

      return withCurrentRound(state, updatedRound);
    }
    case "action":
      throw new DomainError("CardDealt for action cards is not implemented yet (lands in M2)");
    default: {
      const exhaustive: never = event.card;
      throw new DomainError(`Unknown card kind: ${JSON.stringify(exhaustive)}`);
    }
  }
}
