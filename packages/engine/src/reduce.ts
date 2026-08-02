import { DomainError } from "./errors.js";

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
      return notImplemented(event, "#14");
    case "RoundStarted":
      return notImplemented(event, "#15");
    case "CardDealt":
      return notImplemented(event, "#16 / #51");
    case "PlayerStayed":
      return notImplemented(event, "#52");
    case "ActionTargeted":
      return notImplemented(event, "M2");
    case "DeckReshuffled":
      return notImplemented(event, "M2");
    case "ManualScoreEntered":
      return notImplemented(event, "M6");
    case "RoundClosed":
      return notImplemented(event, "#54");
    default: {
      const exhaustive: never = event;
      throw new DomainError(`Unknown event type: ${JSON.stringify(exhaustive)}`);
    }
  }
}

export function fold(events: readonly GameEvent[]): GameState {
  return events.reduce(reduce, initialState);
}
