import { InMemoryGameRepository, LocalStorageGameRepository } from "@flip-7/adapters";

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
    default:
      throw new Error(`Unknown NEXT_PUBLIC_STORAGE_ADAPTER: "${adapter}"`);
  }
}
