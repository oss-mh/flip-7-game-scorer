import {
  ACTION_TYPES,
  type Card,
  MODIFIER_VALUES,
  NUMBER_VALUES,
  createActionCard,
  createModifierCard,
  createNumberCard,
} from "./cards.js";

export const DECK_SIZE = 94;

/** Copies of a given number card in the deck: one 0, then N copies of N for 1–12. */
function copiesForNumberValue(value: number): number {
  return value === 0 ? 1 : value;
}

/**
 * The full, unshuffled 94-card Flip 7 deck in a fixed, deterministic order.
 * Shuffling is the caller's responsibility via a `Shuffler` port — the
 * engine never introduces randomness itself.
 */
export function createDeck(): readonly Card[] {
  const cards: Card[] = [];

  for (const value of NUMBER_VALUES) {
    const copies = copiesForNumberValue(value);
    for (let copy = 1; copy <= copies; copy += 1) {
      cards.push(createNumberCard(value, copy));
    }
  }

  for (const modifier of MODIFIER_VALUES) {
    cards.push(createModifierCard(modifier, 1));
  }

  for (const action of ACTION_TYPES) {
    for (let copy = 1; copy <= 3; copy += 1) {
      cards.push(createActionCard(action, copy));
    }
  }

  return cards;
}

/**
 * How many 94-card decks a table of this size plays with. Derived from
 * player count rather than stored on `GameState`, so it can never drift
 * out of sync with the roster.
 */
export function deckCountForPlayerCount(playerCount: number): 1 | 2 {
  return playerCount > 18 ? 2 : 1;
}
