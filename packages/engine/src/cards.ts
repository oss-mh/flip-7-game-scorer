/**
 * Stable, human-readable identifier for a single physical card in the deck.
 * Encodes kind, face and copy index so duplicates (e.g. the three "7"s)
 * remain distinguishable — see `createNumberCard` et al.
 */
export type CardId = string;

export type NumberValue = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

export const NUMBER_VALUES: readonly NumberValue[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

export interface NumberCard {
  readonly id: CardId;
  readonly kind: "number";
  readonly value: NumberValue;
}

export type ModifierValue = 2 | 4 | 6 | 8 | 10 | "x2";

export const MODIFIER_VALUES: readonly ModifierValue[] = [2, 4, 6, 8, 10, "x2"];

export interface ModifierCard {
  readonly id: CardId;
  readonly kind: "modifier";
  readonly modifier: ModifierValue;
}

export type ActionType = "freeze" | "flipThree" | "secondChance";

export const ACTION_TYPES: readonly ActionType[] = ["freeze", "flipThree", "secondChance"];

export interface ActionCard {
  readonly id: CardId;
  readonly kind: "action";
  readonly action: ActionType;
}

export type Card = NumberCard | ModifierCard | ActionCard;

export function isNumberCard(card: Card): card is NumberCard {
  return card.kind === "number";
}

export function isModifierCard(card: Card): card is ModifierCard {
  return card.kind === "modifier";
}

export function isActionCard(card: Card): card is ActionCard {
  return card.kind === "action";
}

/**
 * A card *face* — one of the 22 distinct printed faces in the deck — as
 * opposed to a `Card`, which is one specific physical copy of a face (e.g.
 * "the second 7"). Card ids aren't unique across a two-deck game (each deck
 * mints its own "num-7-3"), so anything counting *how many are left*, like
 * `remainingDeck`, has to key on the face rather than the id.
 */
export type CardFace =
  | { readonly kind: "number"; readonly value: NumberValue }
  | { readonly kind: "modifier"; readonly modifier: ModifierValue }
  | { readonly kind: "action"; readonly action: ActionType };

/** Fixed, deterministic order — every declared number, then modifier, then action face once each. */
export const CARD_FACES: readonly CardFace[] = [
  ...NUMBER_VALUES.map((value): CardFace => ({ kind: "number", value })),
  ...MODIFIER_VALUES.map((modifier): CardFace => ({ kind: "modifier", modifier })),
  ...ACTION_TYPES.map((action): CardFace => ({ kind: "action", action })),
];

export function faceOfCard(card: Card): CardFace {
  switch (card.kind) {
    case "number":
      return { kind: "number", value: card.value };
    case "modifier":
      return { kind: "modifier", modifier: card.modifier };
    case "action":
      return { kind: "action", action: card.action };
  }
}

/** Stable string key for a face — safe to use as a `Map`/`Record` key or in a warning message. */
export function faceKey(face: CardFace): string {
  switch (face.kind) {
    case "number":
      return `number:${face.value}`;
    case "modifier":
      return `modifier:${face.modifier}`;
    case "action":
      return `action:${face.action}`;
  }
}

function modifierLabel(modifier: ModifierValue): string {
  return modifier === "x2" ? "x2" : `plus${modifier}`;
}

/** `copyIndex` is 1-based: the third "7" in the deck is `createNumberCard(7, 3)` → id `num-7-3`. */
export function createNumberCard(value: NumberValue, copyIndex: number): NumberCard {
  return { id: `num-${value}-${copyIndex}`, kind: "number", value };
}

export function createModifierCard(modifier: ModifierValue, copyIndex: number): ModifierCard {
  return {
    id: `mod-${modifierLabel(modifier)}-${copyIndex}`,
    kind: "modifier",
    modifier,
  };
}

export function createActionCard(action: ActionType, copyIndex: number): ActionCard {
  return { id: `action-${action}-${copyIndex}`, kind: "action", action };
}

/** The inverse of `faceOfCard`: mints a concrete card for a face at the given copy index. */
export function cardOfFace(face: CardFace, copyIndex: number): Card {
  switch (face.kind) {
    case "number":
      return createNumberCard(face.value, copyIndex);
    case "modifier":
      return createModifierCard(face.modifier, copyIndex);
    case "action":
      return createActionCard(face.action, copyIndex);
  }
}
