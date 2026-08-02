import { DomainError } from "../errors.js";

import {
  requireActivePlayerRound,
  requireCurrentRound,
  withCurrentRound,
} from "./roundHelpers.js";

import type { CardDealtEvent } from "../events.js";
import type { PlayerId } from "../player.js";
import type { GameState, PlayerRoundState, RoundState } from "../state.js";

const FLIP_7_HAND_SIZE = 7;

/**
 * Flip 7 ends the round immediately for everyone. The player who flipped it
 * is marked `flipped7`; every other still-active player banks whatever
 * they're holding, exactly as if they'd chosen to stay. The +15 bonus
 * itself is applied at scoring time (#55), never stored here.
 */
function bankOtherActivePlayers(
  players: Readonly<Record<PlayerId, PlayerRoundState>>,
  flipped7PlayerId: PlayerId,
): Readonly<Record<PlayerId, PlayerRoundState>> {
  const updated: Record<PlayerId, PlayerRoundState> = { ...players };
  for (const [id, playerRound] of Object.entries(updated)) {
    if (id !== flipped7PlayerId && playerRound.status === "active") {
      updated[id] = { ...playerRound, status: "stayed" };
    }
  }
  return updated;
}

export function applyCardDealt(state: GameState, event: CardDealtEvent): GameState {
  const round = requireCurrentRound(state);
  const playerRound = requireActivePlayerRound(round, event.playerId);

  switch (event.card.kind) {
    case "number": {
      const card = event.card;
      const isDuplicate = playerRound.numberCards.some(
        (existing) => existing.value === card.value,
      );
      const numberCards = [...playerRound.numberCards, card];
      const hasFlipped7 = !isDuplicate && numberCards.length === FLIP_7_HAND_SIZE;

      const updatedPlayerRound: PlayerRoundState = {
        ...playerRound,
        numberCards,
        status: isDuplicate ? "busted" : hasFlipped7 ? "flipped7" : "active",
      };

      const players = hasFlipped7
        ? bankOtherActivePlayers(
            { ...round.players, [event.playerId]: updatedPlayerRound },
            event.playerId,
          )
        : { ...round.players, [event.playerId]: updatedPlayerRound };

      const updatedRound: RoundState = {
        ...round,
        players,
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
