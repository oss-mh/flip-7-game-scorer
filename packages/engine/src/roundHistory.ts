import { initialState, reduce } from "./reduce.js";

import type { GameEvent } from "./events.js";
import type { PlayerId } from "./player.js";
import type { GameState, RoundState } from "./state.js";

export interface RoundHistoryEntry {
  readonly round: RoundState;
  /** Each player's cumulative score as of this round's close, not the game's final total. */
  readonly runningTotals: Readonly<Record<PlayerId, number>>;
}

/**
 * One entry per closed round, oldest first. `GameState.currentRound` only
 * ever holds the round most recently started — `RoundStarted` replaces it
 * wholesale (see `roundStarted.ts`) — so there's no shortcut to a list of
 * past rounds anywhere in state. This replays the log itself, snapshotting
 * `currentRound` and `cumulativeScores` right after each `RoundClosed`
 * (before the next `RoundStarted` discards them), the same window
 * `RoundSummary` reads from for the round that just ended.
 *
 * A round still in progress — no `RoundClosed` yet — has no entry.
 */
export function roundHistory(events: readonly GameEvent[]): readonly RoundHistoryEntry[] {
  const entries: RoundHistoryEntry[] = [];
  let state: GameState = initialState;

  for (const event of events) {
    state = reduce(state, event);
    if (event.t === "RoundClosed" && state.currentRound) {
      entries.push({ round: state.currentRound, runningTotals: state.cumulativeScores });
    }
  }

  return entries;
}
