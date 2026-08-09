import {
  HttpGameRepository,
  InMemoryGameRepository,
  LocalStorageGameRepository,
  OfflineQueueGameRepository,
} from "@flip-7/adapters";

import {
  appendEventsAction,
  archiveGameAction,
  createGameAction,
  deleteGameAction,
  listGamesAction,
  loadEventsAction,
  loadSnapshotAction,
  saveSnapshotAction,
  truncateEventsAction,
  unarchiveGameAction,
} from "./serverActions/gameActions";

import type { GameRepository } from "@flip-7/engine";

/**
 * The single place in apps/web allowed to import a concrete storage
 * adapter — everywhere else depends on the `GameRepository` port type only.
 * See AGENTS.md, "apps/web never imports a concrete adapter".
 *
 * Adapter choice is driven by `NEXT_PUBLIC_STORAGE_ADAPTER` so a future
 * remote adapter (M10) is a case added here, not a change to any component.
 */
export function createGameRepository(): GameRepository {
  const adapter = process.env.NEXT_PUBLIC_STORAGE_ADAPTER;

  switch (adapter) {
    case undefined:
    case "local-storage":
      return new LocalStorageGameRepository();
    case "in-memory":
      return new InMemoryGameRepository();
    case "http":
      // The Server Action imports above are the actual network transport
      // (#88) — importing them here, in a "use client" composition root,
      // is exactly what turns each into a callable RPC stub rather than a
      // local function call. See gameActions.ts's doc comment.
      //
      // Wrapped in OfflineQueueGameRepository (#90), not used bare: every
      // read and write goes to localStorage first and returns without
      // waiting on the network, with the http adapter synced in the
      // background — see docs/adr/0005, "local-first remains the default;
      // remote is an enhancement, never a dependency". Selecting "http"
      // adds remote sync on top of local storage, it doesn't replace it.
      return new OfflineQueueGameRepository({
        local: new LocalStorageGameRepository(),
        remote: new HttpGameRepository({
          createGame: createGameAction,
          listGames: listGamesAction,
          loadEvents: loadEventsAction,
          appendEvents: appendEventsAction,
          truncateEvents: truncateEventsAction,
          saveSnapshot: saveSnapshotAction,
          loadSnapshot: loadSnapshotAction,
          archiveGame: archiveGameAction,
          unarchiveGame: unarchiveGameAction,
          deleteGame: deleteGameAction,
        }),
      });
    default:
      throw new Error(`Unknown NEXT_PUBLIC_STORAGE_ADAPTER: "${adapter}"`);
  }
}
