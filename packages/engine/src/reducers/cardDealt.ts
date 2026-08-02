import { DomainError } from "../errors.js";

import { requireActivePlayerRound, requireCurrentRound, withCurrentRound } from "./roundHelpers.js";

import type { CardDealtEvent } from "../events.js";
import type { PlayerId } from "../player.js";
import type {
  ForcedDrawRemainingResolution,
  GameState,
  PlayerRoundState,
  RoundState,
} from "../state.js";

const FLIP_7_HAND_SIZE = 7;
const FLIP_THREE_DRAW_COUNT = 3;

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

/**
 * The card that was just dealt fills one of the three slots a Flip Three
 * owes `pending.playerId` — decrement it, dropping it off the front of the
 * queue once all three have landed. Anything the dealt card itself queued
 * (a nested Freeze or Flip Three — #62) was appended behind it and is left
 * untouched.
 */
function consumeForcedDraw(round: RoundState, pending: ForcedDrawRemainingResolution): RoundState {
  const cardsRemaining = pending.cardsRemaining - 1;
  const rest = round.pendingResolutions.slice(1);
  const pendingResolutions = cardsRemaining > 0 ? [{ ...pending, cardsRemaining }, ...rest] : rest;
  return { ...round, pendingResolutions };
}

export function applyCardDealt(state: GameState, event: CardDealtEvent): GameState {
  const round = requireCurrentRound(state);

  const pending = round.pendingResolutions[0];
  let forcedDraw: ForcedDrawRemainingResolution | null = null;
  if (pending) {
    if (pending.kind === "forced-draw-remaining" && pending.playerId === event.playerId) {
      forcedDraw = pending;
    } else {
      throw new DomainError(
        `Cannot deal to "${event.playerId}" while a pending resolution is unresolved`,
      );
    }
  }

  const playerRound = requireActivePlayerRound(round, event.playerId);

  // A duplicate or a seventh unique number aborts a Flip Three in progress
  // instead of merely counting toward it — see #61.
  let abortsForcedDraw = false;

  let updatedRound: RoundState;
  switch (event.card.kind) {
    case "number": {
      const card = event.card;
      const isDuplicate = playerRound.numberCards.some((existing) => existing.value === card.value);

      if (isDuplicate && playerRound.heldSecondChance) {
        // Second Chance intercepts the bust: both cards are discarded (the
        // duplicate never joins numberCards), the player's existing hand is
        // untouched, and they stay active — see #63. Not a bust, so a Flip
        // Three in progress isn't aborted by this card either.
        const updatedPlayerRound: PlayerRoundState = { ...playerRound, heldSecondChance: null };
        updatedRound = {
          ...round,
          players: { ...round.players, [event.playerId]: updatedPlayerRound },
          cardsDealt: [...round.cardsDealt, card],
        };
        break;
      }

      const numberCards = [...playerRound.numberCards, card];
      const hasFlipped7 = !isDuplicate && numberCards.length === FLIP_7_HAND_SIZE;
      abortsForcedDraw = isDuplicate || hasFlipped7;

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

      updatedRound = {
        ...round,
        players,
        cardsDealt: [...round.cardsDealt, card],
      };
      break;
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

      updatedRound = {
        ...round,
        players: { ...round.players, [event.playerId]: updatedPlayerRound },
        cardsDealt: [...round.cardsDealt, card],
      };
      break;
    }
    case "action": {
      const card = event.card;
      switch (card.action) {
        // Neither Freeze nor Flip Three joins a card row — action cards
        // aren't held, they interrupt — so each only needs recording in
        // the deck log and queuing its own resolution.
        case "freeze":
          updatedRound = {
            ...round,
            cardsDealt: [...round.cardsDealt, card],
            pendingResolutions: [
              ...round.pendingResolutions,
              { kind: "awaiting-target", card, sourcePlayerId: event.playerId },
            ],
          };
          break;
        case "flipThree":
          updatedRound = {
            ...round,
            cardsDealt: [...round.cardsDealt, card],
            pendingResolutions: [
              ...round.pendingResolutions,
              {
                kind: "forced-draw-remaining",
                playerId: event.playerId,
                cardsRemaining: FLIP_THREE_DRAW_COUNT,
              },
            ],
          };
          break;
        case "secondChance": {
          // Holding one doesn't need a resolution queued — there's no
          // target to pick — so it just sits on the player's own state.
          // A second, duplicate Second Chance needs reassignment to
          // another player, which is a later M2 issue.
          if (playerRound.heldSecondChance) {
            throw new DomainError(
              `CardDealt for a duplicate Second Chance held by "${event.playerId}" is not implemented yet (lands in a later M2 issue)`,
            );
          }
          const updatedPlayerRound: PlayerRoundState = { ...playerRound, heldSecondChance: card };
          updatedRound = {
            ...round,
            players: { ...round.players, [event.playerId]: updatedPlayerRound },
            cardsDealt: [...round.cardsDealt, card],
          };
          break;
        }
        default: {
          const exhaustive: never = card.action;
          throw new DomainError(`Unknown action type: ${JSON.stringify(exhaustive)}`);
        }
      }
      break;
    }
    default: {
      const exhaustive: never = event.card;
      throw new DomainError(`Unknown card kind: ${JSON.stringify(exhaustive)}`);
    }
  }

  let finalRound = updatedRound;
  if (forcedDraw) {
    // A bust or Flip 7 cancels whatever draws were still owed, discarding
    // the whole queue rather than decrementing it — that also drops any
    // nested action (a Freeze revealed mid-sequence, say) that was queued
    // behind the forced draw and never got the chance to resolve (#61).
    finalRound = abortsForcedDraw
      ? { ...updatedRound, pendingResolutions: [] }
      : consumeForcedDraw(updatedRound, forcedDraw);
  }
  return withCurrentRound(state, finalRound);
}
