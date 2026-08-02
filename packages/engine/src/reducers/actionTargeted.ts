import { DomainError } from "../errors.js";

import { applyFreeze } from "./freeze.js";
import { requireActivePlayerRound, requireCurrentRound, withCurrentRound } from "./roundHelpers.js";
import { applySecondChanceReassignment } from "./secondChance.js";

import type { ActionCard } from "../cards.js";
import type { ActionTargetedEvent } from "../events.js";
import type { PlayerId } from "../player.js";
import type { GameState, PlayerRoundState, RoundState } from "../state.js";

/**
 * Active is necessary for every action kind; a duplicate Second Chance also
 * excludes anyone already holding one (#17) — which, since the source
 * always holds one themselves, is what rules out self-targeting for this
 * card without needing a separate check.
 */
function requireEligibleTarget(
  round: RoundState,
  card: ActionCard,
  targetId: PlayerId,
): PlayerRoundState {
  const targetRound = requireActivePlayerRound(round, targetId);
  if (card.action === "secondChance" && targetRound.heldSecondChance) {
    throw new DomainError(`"${targetId}" already holds a Second Chance and cannot receive another`);
  }
  return targetRound;
}

/**
 * Applies whatever effect resolving `card` onto `targetRound` has. Each
 * action kind owns its own handler; "flipThree" never produces an
 * awaiting-target item in the first place (it forces the drawing player's
 * own draws instead — #60), so that branch only guards against a bug
 * elsewhere ever queuing one.
 */
function applyActionCardEffect(
  round: RoundState,
  card: ActionCard,
  targetRound: PlayerRoundState,
): RoundState {
  switch (card.action) {
    case "freeze":
      return applyFreeze(round, targetRound);
    case "secondChance":
      return applySecondChanceReassignment(round, card, targetRound);
    case "flipThree":
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
 * own card can be resolved here, and only onto an eligible target.
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

  const targetRound = requireEligibleTarget(round, pending.card, event.targetId);

  const dequeuedRound: RoundState = {
    ...round,
    pendingResolutions: round.pendingResolutions.slice(1),
  };

  const resolvedRound = applyActionCardEffect(dequeuedRound, pending.card, targetRound);

  return withCurrentRound(state, resolvedRound);
}
