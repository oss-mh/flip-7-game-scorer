import { EVENT_SCHEMA_VERSION, initialState, reduce } from "@flip-7/engine";

import type { GameId, GameRepository, GameState } from "@flip-7/engine";

/** Default cadence for automatic snapshotting — see README, "The storage port". */
export const DEFAULT_SNAPSHOT_INTERVAL = 100;

/**
 * Reconstructs a game's current state from its latest compatible snapshot
 * plus whatever events landed after it, instead of folding the entire log
 * from the start every time. A snapshot written under a schema version
 * this build doesn't recognise is ignored outright and a full fold is used
 * instead — never guess at how to read data from an incompatible schema.
 */
export async function loadGameState(repo: GameRepository, gameId: GameId): Promise<GameState> {
  const snapshot = await repo.loadSnapshot(gameId);
  const usableSnapshot =
    snapshot !== null && snapshot.schemaVersion === EVENT_SCHEMA_VERSION ? snapshot : null;

  const events = await repo.loadEvents(gameId, usableSnapshot?.version ?? 0);
  const baseState = usableSnapshot?.state ?? initialState;

  return events.reduce(reduce, baseState);
}

/**
 * Whether an append that moved a game's log from `previousVersion` to
 * `newVersion` earns a snapshot: true once it crosses a multiple of
 * `intervalEvents`, even when a single batched append skips past the exact
 * boundary (e.g. 95 -> 105 with the default interval of 100).
 */
export function crossedSnapshotInterval(
  previousVersion: number,
  newVersion: number,
  intervalEvents: number = DEFAULT_SNAPSHOT_INTERVAL,
): boolean {
  return Math.floor(previousVersion / intervalEvents) < Math.floor(newVersion / intervalEvents);
}

/**
 * Saves a snapshot if `crossedSnapshotInterval` says this append earned
 * one. `state` is the `GameState` that resulted from applying the
 * appended events — the caller already has it, so this never re-derives
 * it with a redundant fold.
 */
export async function maybeSaveSnapshot(
  repo: GameRepository,
  gameId: GameId,
  previousVersion: number,
  newVersion: number,
  state: GameState,
  intervalEvents: number = DEFAULT_SNAPSHOT_INTERVAL,
): Promise<void> {
  if (crossedSnapshotInterval(previousVersion, newVersion, intervalEvents)) {
    await repo.saveSnapshot(gameId, newVersion, state);
  }
}
