import { DomainError } from "../errors.js";

import { requireActivePlayerRound, requireCurrentRound, withCurrentRound } from "./roundHelpers.js";

import type { ActionTargetedEvent } from "../events.js";
import type { GameState, RoundState } from "../state.js";

/**
 * Validates and consumes the "awaiting-target" item at the front of the
 * resolution queue — see #58's `nextResolution`. Only the source player's
 * own card can be resolved here, and only onto an active player: busted,
 * stayed and frozen players are never valid targets, and an active source
 * player is always themselves a valid target, which is what makes
 * self-targeting available (and, when they're the only active player left,
 * forced — nothing else in `players` would pass this check).
 *
 * Resolving the target only clears the queue slot; the game-specific effect
 * of each action kind (e.g. Freeze banking the target's score) is applied
 * by that card's own handler, not here.
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

  requireActivePlayerRound(round, event.targetId);

  const updatedRound: RoundState = {
    ...round,
    pendingResolutions: round.pendingResolutions.slice(1),
  };

  return withCurrentRound(state, updatedRound);
}
