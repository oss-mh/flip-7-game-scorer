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
    case "modifier":
      throw new DomainError("CardDealt for modifier cards is not implemented yet (lands in #51)");
    case "action":
      throw new DomainError("CardDealt for action cards is not implemented yet (lands in M2)");
    default: {
      const exhaustive: never = event.card;
      throw new DomainError(`Unknown card kind: ${JSON.stringify(exhaustive)}`);
    }
  }
}
