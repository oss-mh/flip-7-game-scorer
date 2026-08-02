import { DomainError } from "./errors.js";
import { applyActionTargeted } from "./reducers/actionTargeted.js";
import { applyCardDealt } from "./reducers/cardDealt.js";
import { applyDeckReshuffled } from "./reducers/deckReshuffled.js";
import { applyGameCreated } from "./reducers/gameCreated.js";
import { applyPlayerStayed } from "./reducers/playerStayed.js";
import { applyRoundClosed } from "./reducers/roundClosed.js";
import { applyRoundStarted } from "./reducers/roundStarted.js";

import type { GameEvent } from "./events.js";
import type { GameState } from "./state.js";

/**
 * Starting point for `fold`. Every field here is overwritten by the
 * `GameCreated` handler, which must be the first event in any real log —
 * its values only matter for type-conformance.
 */
export const initialState: GameState = {
  players: [],
  targetScore: 0,
  cumulativeScores: {},
  roundNumber: 0,
  currentRound: null,
  status: "active",
};

/**
 * Marks an event type that's part of the union but whose reducer logic
 * hasn't landed yet. Throwing beats a silent no-op: per AGENTS.md's design
 * priorities, losing an event's effect would be worse than a loud failure.
 */
function notImplemented(event: GameEvent, landsIn: string): never {
  throw new DomainError(`"${event.t}" is not implemented yet (lands in ${landsIn})`);
}

/**
 * Pure fold of a single event onto state: no clock, no randomness, no IO.
 * Every branch is a case in the `GameEvent` union; the `never` guard in
 * `default` means a new event type fails to compile here until handled.
 */
export function reduce(state: GameState, event: GameEvent): GameState {
  switch (event.t) {
    case "GameCreated":
      return applyGameCreated(event);
    case "RoundStarted":
      return applyRoundStarted(state, event);
    case "CardDealt":
      return applyCardDealt(state, event);
    case "PlayerStayed":
      return applyPlayerStayed(state, event);
    case "ActionTargeted":
      return applyActionTargeted(state, event);
    case "DeckReshuffled":
      return applyDeckReshuffled(state);
    case "ManualScoreEntered":
      return notImplemented(event, "M6");
    case "RoundClosed":
      return applyRoundClosed(state);
    default: {
      const exhaustive: never = event;
      throw new DomainError(`Unknown event type: ${JSON.stringify(exhaustive)}`);
    }
  }
}

export function fold(events: readonly GameEvent[]): GameState {
  return events.reduce(reduce, initialState);
}
