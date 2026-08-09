"use client";

import { getSyncStatus, subscribeSyncStatus } from "@flip-7/adapters";
import { useCallback, useSyncExternalStore } from "react";

import { useGameRepository } from "./gameRepositoryContext";

import type { SyncStatus } from "@flip-7/adapters";
import type { GameId } from "@flip-7/engine";

/**
 * Live remote-sync status for one game — "synced" and `pendingCount: 0`
 * for every adapter except the offline-queue one (#90), which is the
 * point: this works against the `GameRepository` port type alone, no
 * concrete-adapter import needed (`getSyncStatus`/`subscribeSyncStatus`
 * degrade gracefully — see `@flip-7/adapters`, docs/adr/0005).
 *
 * `useSyncExternalStore`, not `useState`/`useEffect`: `SyncStatus` lives
 * outside React (inside whatever `GameRepository` was constructed at the
 * composition root), so this is exactly the "subscribe to an external
 * store" case the hook exists for, and avoids the cascading-render footgun
 * of calling `setState` synchronously from inside an effect body.
 */
export function useSyncStatus(gameId: GameId): SyncStatus {
  const repository = useGameRepository();

  const subscribe = useCallback(
    (onStoreChange: () => void) => subscribeSyncStatus(repository, gameId, () => onStoreChange()),
    [repository, gameId],
  );
  const getSnapshot = useCallback(() => getSyncStatus(repository, gameId), [repository, gameId]);

  return useSyncExternalStore(subscribe, getSnapshot);
}
