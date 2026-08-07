import { CARD_FACES, type CardFace, faceKey, faceOfCard } from "./cards.js";
import { createDeck, deckCountForPlayerCount } from "./deck.js";
import { DomainError } from "./errors.js";

import type { GameEvent } from "./events.js";

export interface RemainingCardCount {
  readonly face: CardFace;
  /** Never negative — see `reconciliationWarnings` for what a shortfall means. */
  readonly remaining: number;
}

export interface RemainingDeckReport {
  /** One entry per `CARD_FACES`, in that fixed order. */
  readonly counts: readonly RemainingCardCount[];
  /** Non-empty only if the log claims to have dealt a face the deck(s) didn't have left. */
  readonly reconciliationWarnings: readonly string[];
}

function baseFaceCounts(playerCount: number): Map<string, number> {
  const counts = new Map<string, number>();
  const deckCount = deckCountForPlayerCount(playerCount);
  for (let copy = 0; copy < deckCount; copy += 1) {
    for (const card of createDeck()) {
      const key = faceKey(faceOfCard(card));
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return counts;
}

function addAll(target: Map<string, number>, source: ReadonlyMap<string, number>): void {
  for (const [key, count] of source) {
    target.set(key, (target.get(key) ?? 0) + count);
  }
}

/**
 * Card faces remaining in the draw pile(s), derived from the whole event
 * log rather than `GameState` — `GameState.currentRound.cardsDealt` only
 * covers the round in progress, but the physical deck carries depletion
 * across rounds, and a two-deck game needs the full player count from
 * `GameCreated` to size the pool correctly (#38).
 *
 * A card leaves the draw pile the moment it's dealt. It rejoins the pile
 * only once `DeckReshuffled` fires — and per `applyDeckReshuffled`, that
 * reshuffles the discard pile only, never cards currently in front of a
 * player in the round still in progress (busted players included). So the
 * round in progress is tracked separately and only folded into the discard
 * pile once the *next* round starts, mirroring the reducer's own
 * "cardsDealt resets on RoundStarted" behaviour.
 */
export function remainingDeck(events: readonly GameEvent[]): RemainingDeckReport {
  let remaining = new Map<string, number>();
  let discardPile = new Map<string, number>();
  let currentRoundDealt: string[] = [];
  let roundInProgress = false;
  const reconciliationWarnings: string[] = [];

  for (const event of events) {
    switch (event.t) {
      case "GameCreated": {
        remaining = baseFaceCounts(event.players.length);
        discardPile = new Map();
        currentRoundDealt = [];
        roundInProgress = false;
        break;
      }
      case "RoundStarted": {
        if (roundInProgress) {
          for (const key of currentRoundDealt) {
            discardPile.set(key, (discardPile.get(key) ?? 0) + 1);
          }
        }
        currentRoundDealt = [];
        roundInProgress = true;
        break;
      }
      case "CardDealt": {
        const key = faceKey(faceOfCard(event.card));
        const before = remaining.get(key) ?? 0;
        if (before <= 0) {
          reconciliationWarnings.push(
            `"${key}" was dealt (seq ${event.seq}) with none left in the deck — reconcile the event log`,
          );
        }
        remaining.set(key, before - 1);
        currentRoundDealt.push(key);
        break;
      }
      case "DeckReshuffled": {
        addAll(remaining, discardPile);
        discardPile = new Map();
        break;
      }
      case "PlayerStayed":
      case "ActionTargeted":
      case "ManualScoreEntered":
      case "RoundClosed":
        break;
      default: {
        const exhaustive: never = event;
        throw new DomainError(`Unknown event type: ${JSON.stringify(exhaustive)}`);
      }
    }
  }

  const counts: RemainingCardCount[] = CARD_FACES.map((face) => ({
    face,
    remaining: Math.max(0, remaining.get(faceKey(face)) ?? 0),
  }));

  return { counts, reconciliationWarnings };
}
