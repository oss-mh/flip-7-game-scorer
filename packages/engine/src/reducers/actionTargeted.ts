import { DomainError } from "../errors.js";

import { applyFreeze } from "./freeze.js";
import { requireActivePlayerRound, requireCurrentRound, withCurrentRound } from "./roundHelpers.js";

import type { ActionCard } from "../cards.js";
import type { ActionTargetedEvent } from "../events.js";
import type { GameState, PlayerRoundState, RoundState } from "../state.js";

/**
 * Applies whatever effect resolving `card` onto `targetRound` has. Each
 * action kind owns its own handler; only "freeze" (#59) exists so far.
 */
function applyActionCardEffect(
  round: RoundState,
  card: ActionCard,
  targetRound: PlayerRoundState,
): RoundState {
  switch (card.action) {
    case "freeze":
      return applyFreeze(round, targetRound);
    case "flipThree":
    case "secondChance":
      throw new DomainError(
        `ActionTargeted for "${card.action}" is not implemented yet (lands in M2)`,
      );
    default: {
      const exhaustive: never = card.action;
      throw new DomainError(`Unknown action type: ${JSON.stringify(exhaustive)}`);
    }
  }
}

/**
 * Validates and consumes the "awaiting-target" item at the front of the
 * resolution queue — see #58's `nextResolution`. Only the source player's
 * own card can be resolved here, and only onto an active player: busted,
 * stayed and frozen players are never valid targets, and an active source
 * player is always themselves a valid target, which is what makes
 * self-targeting available (and, when they're the only active player left,
 * forced — nothing else in `players` would pass this check).
 */
export function applyActionTargeted(state: GameState, event: ActionTargetedEvent): GameState {
  const round = requireCurrentRound(state);
  const pending = round.pendingResolutions[0];

  if (!pending || pending.kind !== "awaiting-target") {
    throw new DomainError("No action card is awaiting a target");
  }
  if (pending.card.id !== event.card.id || pending.sourcePlayerId !== event.sourceId) {
    throw new DomainError(
      `ActionTargeted for card "${event.card.id}" from "${event.sourceId}" does not match the pending resolution`,
    );
  }

  const targetRound = requireActivePlayerRound(round, event.targetId);

  const dequeuedRound: RoundState = {
    ...round,
    pendingResolutions: round.pendingResolutions.slice(1),
  };

  const resolvedRound = applyActionCardEffect(dequeuedRound, pending.card, targetRound);

  return withCurrentRound(state, resolvedRound);
}
