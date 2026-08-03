"use client";

import { maybeSaveSnapshot } from "@flip-7/adapters";
import { EVENT_SCHEMA_VERSION, initialState, reduce } from "@flip-7/engine";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { useGameRepository } from "./gameRepositoryContext";
import { systemClock } from "./systemClock";

import type { GameEvent, GameId, GameRepository, GameState } from "@flip-7/engine";
import type { ReactNode } from "react";

/** A `GameEvent` minus the envelope fields `dispatch` fills in itself. */
type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;
export type GameCommand = DistributiveOmit<GameEvent, "schemaVersion" | "at" | "seq">;

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

function toEvent(command: GameCommand, seq: number, at: string): GameEvent {
  return { ...command, schemaVersion: EVENT_SCHEMA_VERSION, at, seq } as GameEvent;
}

/**
 * Mirrors `loadGameState` from @flip-7/adapters (snapshot + fold-forward)
 * but also returns the resulting version, which `appendEvents` needs and
 * `loadGameState` doesn't expose. Reads its own snapshot/events pair
 * instead of calling `loadGameState` and then loading events again, so
 * there's exactly one read of each — never two reads that could
 * theoretically observe different data.
 */
async function loadGameStateWithVersion(
  repository: GameRepository,
  gameId: GameId,
): Promise<{ state: GameState; version: number }> {
  const snapshot = await repository.loadSnapshot(gameId);
  const usableSnapshot =
    snapshot !== null && snapshot.schemaVersion === EVENT_SCHEMA_VERSION ? snapshot : null;

  const events = await repository.loadEvents(gameId, usableSnapshot?.version ?? 0);
  const baseState = usableSnapshot?.state ?? initialState;

  return {
    state: events.reduce(reduce, baseState),
    version: (usableSnapshot?.version ?? 0) + events.length,
  };
}

type LoadedData =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly error: Error }
  | { readonly status: "empty" }
  | { readonly status: "ready"; readonly state: GameState; readonly version: number };

/**
 * What `useGame()` returns. `dispatch` only exists on the `ready` variant —
 * there's nothing to dispatch onto otherwise — and `retry` only on the
 * recoverable `error`/`empty` variants. See AGENTS.md acceptance criteria,
 * "Loading, error and empty states handled explicitly".
 */
export type GameQuery =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly error: Error; readonly retry: () => void }
  | { readonly status: "empty"; readonly retry: () => void }
  | {
      readonly status: "ready";
      readonly state: GameState;
      readonly dispatch: (commands: readonly GameCommand[]) => Promise<void>;
    };

const GameContext = createContext<GameQuery | null>(null);

/**
 * Does the actual loading/dispatching for one `gameId`. Remounted (via the
 * `key` on the wrapper below) rather than resetting its own state in an
 * effect, so the initial "loading" state is a plain `useState` initializer
 * instead of a synchronous `setState` inside an effect body.
 */
function GameProviderSession({
  gameId,
  retry,
  children,
}: {
  gameId: GameId;
  retry: () => void;
  children: ReactNode;
}) {
  const repository = useGameRepository();
  const [data, setData] = useState<LoadedData>({ status: "loading" });

  // Lets `dispatch` read the latest state synchronously (to validate and
  // roll back) without being recreated on every state change. Synced in an
  // effect, not during render, so it never mutates a ref while rendering.
  const dataRef = useRef(data);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    let cancelled = false;

    loadGameStateWithVersion(repository, gameId)
      .then(({ state, version }) => {
        if (cancelled) return;
        setData(version === 0 ? { status: "empty" } : { status: "ready", state, version });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setData({ status: "error", error: toError(error) });
      });

    return () => {
      cancelled = true;
    };
  }, [repository, gameId]);

  const dispatch = useCallback(
    async (commands: readonly GameCommand[]): Promise<void> => {
      const current = dataRef.current;
      if (current.status !== "ready") {
        throw new Error(`Cannot dispatch while the game is "${current.status}"`);
      }

      const { state: previousState, version: previousVersion } = current;
      const at = systemClock.now();
      const events = commands.map((command, index) =>
        toEvent(command, previousVersion + index + 1, at),
      );

      // Validate against the engine before touching anything — an illegal
      // move throws here and nothing else happens.
      const nextState = events.reduce(reduce, previousState);

      // Optimistic update — the table doesn't wait on a write to see the
      // result. See AGENTS.md design priorities, "Speed at the table".
      setData({ status: "ready", state: nextState, version: previousVersion });

      try {
        const result = await repository.appendEvents(gameId, events, previousVersion);
        if (result.outcome === "conflict") {
          throw new Error(
            `Write conflict: expected version ${previousVersion}, storage is at ${result.currentVersion}`,
          );
        }

        setData({ status: "ready", state: nextState, version: result.version });

        try {
          await maybeSaveSnapshot(repository, gameId, previousVersion, result.version, nextState);
        } catch {
          // Snapshotting is a read-performance optimization, not
          // correctness-critical — the event log is still authoritative.
          // A failure here must never undo an already-persisted append.
        }
      } catch (error) {
        // Roll back to what's actually persisted — never show state that
        // isn't safely stored. See AGENTS.md design priorities, "Never
        // lose someone's scores".
        setData({ status: "ready", state: previousState, version: previousVersion });
        throw toError(error);
      }
    },
    [gameId, repository],
  );

  const value = useMemo<GameQuery>(() => {
    switch (data.status) {
      case "loading":
        return { status: "loading" };
      case "error":
        return { status: "error", error: data.error, retry };
      case "empty":
        return { status: "empty", retry };
      case "ready":
        return { status: "ready", state: data.state, dispatch };
    }
  }, [data, dispatch, retry]);

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function GameProvider({ gameId, children }: { gameId: GameId; children: ReactNode }) {
  const [reloadToken, setReloadToken] = useState(0);
  const retry = useCallback(() => setReloadToken((token) => token + 1), []);

  return (
    <GameProviderSession key={`${gameId}:${reloadToken}`} gameId={gameId} retry={retry}>
      {children}
    </GameProviderSession>
  );
}

export function useGame(): GameQuery {
  const value = useContext(GameContext);
  if (value === null) {
    throw new Error("useGame must be used within a GameProvider");
  }
  return value;
}
