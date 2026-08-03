import {
  ACTION_TYPES,
  MODIFIER_VALUES,
  NUMBER_VALUES,
  createActionCard,
  createModifierCard,
  createNumberCard,
  deckCountForPlayerCount,
  isActionCard,
  isModifierCard,
} from "@flip-7/engine";

import type { ActionType, Card, ModifierValue, NumberValue } from "@flip-7/engine";

/**
 * A card *face* — one of the 22 distinct buttons in the picker grid — as
 * opposed to a `Card`, which is one specific physical copy of a face (e.g.
 * "the second 7"). The picker is keyed on faces; dealing mints the next
 * unused copy of whichever face was tapped, via `nextCardForFace`.
 */
export type CardFace =
  | { readonly kind: "number"; readonly value: NumberValue }
  | { readonly kind: "modifier"; readonly modifier: ModifierValue }
  | { readonly kind: "action"; readonly action: ActionType };

/** Fixed grid order — never reorder this array. #67 requires the picker to be "muscle-memory stable". */
export const CARD_FACES: readonly CardFace[] = [
  ...NUMBER_VALUES.map((value): CardFace => ({ kind: "number", value })),
  ...MODIFIER_VALUES.map((modifier): CardFace => ({ kind: "modifier", modifier })),
  ...ACTION_TYPES.map((action): CardFace => ({ kind: "action", action })),
];

export function faceKey(face: CardFace): string {
  switch (face.kind) {
    case "number":
      return `number-${face.value}`;
    case "modifier":
      return `modifier-${face.modifier}`;
    case "action":
      return `action-${face.action}`;
  }
}

export function faceOfCard(card: Card): CardFace {
  if (isActionCard(card)) return { kind: "action", action: card.action };
  if (isModifierCard(card)) return { kind: "modifier", modifier: card.modifier };
  return { kind: "number", value: card.value };
}

const ACTION_LABELS: Record<ActionType, string> = {
  freeze: "Freeze",
  flipThree: "Flip Three",
  secondChance: "2nd Chance",
};

/** Short display label for a face — used on picker tiles, lane chips and prompts. */
export function faceLabel(face: CardFace): string {
  switch (face.kind) {
    case "number":
      return String(face.value);
    case "modifier":
      return face.modifier === "x2" ? "×2" : `+${face.modifier}`;
    case "action":
      return ACTION_LABELS[face.action];
  }
}

export function cardLabel(card: Card): string {
  return faceLabel(faceOfCard(card));
}

/** Copies of this face printed in a single 94-card deck. */
function copiesPerDeck(face: CardFace): number {
  if (face.kind === "number") return face.value === 0 ? 1 : face.value;
  if (face.kind === "modifier") return 1;
  return 3;
}

/** How many copies of `face` have already been dealt this round, across any number of decks. */
export function dealtCountForFace(cardsDealt: readonly Card[], face: CardFace): number {
  const key = faceKey(face);
  let count = 0;
  for (const card of cardsDealt) {
    if (faceKey(faceOfCard(card)) === key) count += 1;
  }
  return count;
}

/**
 * Copies of `face` left in the deck(s) this table is playing with. Can go
 * negative in principle if the operator overrides an exhausted face (#68) —
 * callers should clamp to 0 for display.
 */
export function remainingForFace(
  cardsDealt: readonly Card[],
  face: CardFace,
  playerCount: number,
): number {
  const total = copiesPerDeck(face) * deckCountForPlayerCount(playerCount);
  return total - dealtCountForFace(cardsDealt, face);
}

/**
 * The next specific `Card` a tap on `face` should deal — the next unused
 * copy index, purely a count of how many of this face are already in
 * `cardsDealt`. Deliberately doesn't consult `remainingForFace`: the engine
 * places no ceiling on copy index (see AGENTS.md — the physical deck is the
 * source of truth, not this app), so an operator override past the natural
 * deck size just mints copy N+1 and works exactly the same as any other card.
 */
export function nextCardForFace(cardsDealt: readonly Card[], face: CardFace): Card {
  const copyIndex = dealtCountForFace(cardsDealt, face) + 1;
  switch (face.kind) {
    case "number":
      return createNumberCard(face.value, copyIndex);
    case "modifier":
      return createModifierCard(face.modifier, copyIndex);
    case "action":
      return createActionCard(face.action, copyIndex);
  }
}
