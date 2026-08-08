import { initialState, reduce } from "@flip-7/engine";

import type { GameEvent, GameId, GameRepository, GameState } from "@flip-7/engine";

/**
 * The longest prefix of `events` that replays without throwing, found with
 * a single forward pass rather than re-folding the whole log repeatedly:
 * `reduce` only ever looks at the state built from events already applied,
 * so once event `i` fails to reduce cleanly, every event after it would
 * fail at that same point too — the first failure is always the earliest
 * usable cutoff.
 */
export function findLastGoodPrefix(events: readonly GameEvent[]): {
  readonly goodEvents: readonly GameEvent[];
  readonly discardedCount: number;
} {
  let state: GameState = initialState;
  let goodCount = 0;
  for (const event of events) {
    try {
      state = reduce(state, event);
      goodCount++;
    } catch {
      break;
    }
  }
  return { goodEvents: events.slice(0, goodCount), discardedCount: events.length - goodCount };
}

/**
 * The explicit, user-initiated recovery action behind "revert to last good
 * state": truncates storage down to the longest prefix that actually
 * replays, permanently discarding whatever comes after — see
 * `GameRepository.truncateEvents`'s doc comment for why this is the
 * sanctioned way to shrink a log rather than an in-place edit. Callers are
 * expected to back up the full log (`exportGame`) before calling this, so
 * the discarded tail is never lost, only removed from the active game —
 * see AGENTS.md acceptance criteria, "Recovery always preserves the raw
 * log so nothing is silently discarded".
 */
export async function revertToLastGoodState(
  repository: GameRepository,
  gameId: GameId,
): Promise<{ readonly discardedCount: number }> {
  const events = await repository.loadEvents(gameId);
  const { goodEvents, discardedCount } = findLastGoodPrefix(events);
  await repository.truncateEvents(gameId, goodEvents.length);
  return { discardedCount };
}
