import { DomainError } from "../errors.js";

import { requireCurrentRound, requirePlayerRound, withCurrentRound } from "./roundHelpers.js";

import type { ManualScoreEnteredEvent } from "../events.js";
import type { GameState, PlayerRoundState, RoundState } from "../state.js";

/**
 * Records a round score entered directly rather than built up from dealt
 * cards (#78) — for tables that want to play at full speed and just record
 * the result. Allowed on an `active` player (first entry) or one already
 * `manual` (editing a value already entered this round, overwritten
 * last-write-wins per AGENTS.md invariant #4 — corrections are new events,
 * never a mutation of the stored one). Any other status means the player
 * was already scored a different way this round — mixing manual entry with
 * card-tracked play mid-round is #79's concern, not this one's.
 */
export function applyManualScoreEntered(state: GameState, event: ManualScoreEnteredEvent): GameState {
  const round = requireCurrentRound(state);
  const playerRound = requirePlayerRound(round, event.playerId);

  if (playerRound.status !== "active" && playerRound.status !== "manual") {
    throw new DomainError(
      `Player "${event.playerId}" cannot be scored manually — status is "${playerRound.status}"`,
    );
  }

  if (!Number.isInteger(event.points) || event.points < 0) {
    throw new DomainError(`Manual score must be a non-negative integer, got ${event.points}`);
  }

  const updatedPlayerRound: PlayerRoundState = {
    ...playerRound,
    status: "manual",
    manualScore: event.points,
  };

  const updatedRound: RoundState = {
    ...round,
    players: { ...round.players, [event.playerId]: updatedPlayerRound },
  };

  return withCurrentRound(state, updatedRound);
}
