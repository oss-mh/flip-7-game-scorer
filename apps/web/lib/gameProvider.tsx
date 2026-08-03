"use client";

import { maybeSaveSnapshot } from "@flip-7/adapters";
import { EVENT_SCHEMA_VERSION, fold, reduce } from "@flip-7/engine";
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

async function loadFullGameLog(
  repository: GameRepository,
  gameId: GameId,
): Promise<{ state: GameState; events: readonly GameEvent[] }> {
  const events = await repository.loadEvents(gameId);
  return { state: fold(events), events };
}

/**
 * How far back undo may go: the start of the current round, never into an
 * earlier one — see AGENTS.md acceptance criteria, "Multi-step undo back
 * to the start of the current round". Returns the number of events that
 * must remain, i.e. undo is legal while `events.length` exceeds this.
 */
function undoFloor(events: readonly GameEvent[]): number {
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].t === "RoundStarted") {
      return i + 1;
    }
  }
  return 1; // never undo away GameCreated, the log's first event
}

type LoadedData =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly error: Error }
  | { readonly status: "empty" }
  | { readonly status: "ready"; readonly state: GameState; readonly events: readonly GameEvent[] };

/**
 * What `useGame()` returns. `dispatch`/`undo`/`redo` only exist on the
 * `ready` variant — there's nothing to act on otherwise — and `retry` only
 * on the recoverable `error`/`empty` variants. See AGENTS.md acceptance
 * criteria, "Loading, error and empty states handled explicitly".
 */
export type GameQuery =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly error: Error; readonly retry: () => void }
  | { readonly status: "empty"; readonly retry: () => void }
  | {
      readonly status: "ready";
      readonly state: GameState;
      readonly dispatch: (commands: readonly GameCommand[]) => Promise<void>;
      readonly undo: () => Promise<void>;
      readonly redo: () => Promise<void>;
      readonly canUndo: boolean;
      readonly canRedo: boolean;
      /** The most recently undone event, for a "you undid: ..." confirmation. `null` once redone or superseded by a new dispatch. */
      readonly lastUndone: GameEvent | null;
    };

const GameContext = createContext<GameQuery | null>(null);

/**
 * Does the actual loading/dispatching for one `gameId`. Remounted (via the
 * `key` on the wrapper below) rather than resetting its own state in an
 * effect, so the initial "loading" state is a plain `useState` initializer
 * instead of a synchronous `setState` inside an effect body. Remounting
 * also gives undo/redo a clean slate per session, which is intentional —
 * see the module doc on `redoStack` below.
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

  // Undone events, most-recent last, so they can be reapplied in order.
  // Deliberately in-memory only, not persisted: undo truncates storage
  // immediately (durable across a reload — see AGENTS.md acceptance
  // criteria, "Undo history survives a page reload"), but redo is a
  // same-session convenience on top of that, cleared by a fresh dispatch
  // just like most editors' redo stacks are.
  const [redoStack, setRedoStack] = useState<readonly GameEvent[]>([]);
  const [lastUndone, setLastUndone] = useState<GameEvent | null>(null);

  // Lets dispatch/undo/redo read the latest state synchronously (to
  // validate and roll back) without being recreated on every state change.
  // Synced in an effect, not during render, so it never mutates a ref
  // while rendering.
  const dataRef = useRef(data);
  const redoStackRef = useRef(redoStack);
  useEffect(() => {
    dataRef.current = data;
    redoStackRef.current = redoStack;
  }, [data, redoStack]);

  useEffect(() => {
    let cancelled = false;

    loadFullGameLog(repository, gameId)
      .then(({ state, events }) => {
        if (cancelled) return;
        setData(events.length === 0 ? { status: "empty" } : { status: "ready", state, events });
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

      const { state: previousState, events: previousEvents } = current;
      const previousVersion = previousEvents.length;
      const at = systemClock.now();
      const newEvents = commands.map((command, index) =>
        toEvent(command, previousVersion + index + 1, at),
      );

      // Validate against the engine before touching anything — an illegal
      // move throws here and nothing else happens.
      const nextState = newEvents.reduce(reduce, previousState);
      const nextEvents = [...previousEvents, ...newEvents];

      // Optimistic update — the table doesn't wait on a write to see the
      // result. See AGENTS.md design priorities, "Speed at the table".
      setData({ status: "ready", state: nextState, events: nextEvents });

      try {
        const result = await repository.appendEvents(gameId, newEvents, previousVersion);
        if (result.outcome === "conflict") {
          throw new Error(
            `Write conflict: expected version ${previousVersion}, storage is at ${result.currentVersion}`,
          );
        }

        // A genuinely new event invalidates whatever was redoable — see
        // AGENTS.md acceptance criteria, "redo reapplies until a new event
        // is appended".
        setRedoStack([]);
        setLastUndone(null);

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
        setData({ status: "ready", state: previousState, events: previousEvents });
        throw toError(error);
      }
    },
    [gameId, repository],
  );

  const undo = useCallback(async (): Promise<void> => {
    const current = dataRef.current;
    if (current.status !== "ready") {
      throw new Error(`Cannot undo while the game is "${current.status}"`);
    }

    const { events: previousEvents } = current;
    if (previousEvents.length <= undoFloor(previousEvents)) {
      throw new Error("Nothing left to undo in the current round");
    }

    const undoneEvent = previousEvents[previousEvents.length - 1];
    const remainingEvents = previousEvents.slice(0, -1);
    const newState = fold(remainingEvents);

    // Not optimistic, unlike dispatch: wait for the truncation to actually
    // land in storage before showing it, so a failed truncate can never
    // leave the UI showing something that isn't safely persisted. See
    // AGENTS.md design priorities, "Never lose someone's scores".
    await repository.truncateEvents(gameId, remainingEvents.length);

    setData({ status: "ready", state: newState, events: remainingEvents });
    setRedoStack((stack) => [...stack, undoneEvent]);
    setLastUndone(undoneEvent);
  }, [gameId, repository]);

  const redo = useCallback(async (): Promise<void> => {
    const current = dataRef.current;
    if (current.status !== "ready") {
      throw new Error(`Cannot redo while the game is "${current.status}"`);
    }

    const stack = redoStackRef.current;
    if (stack.length === 0) {
      throw new Error("Nothing to redo");
    }

    const { state: previousState, events: previousEvents } = current;
    const eventToRedo = stack[stack.length - 1];
    const remainingStack = stack.slice(0, -1);

    const nextState = reduce(previousState, eventToRedo);
    const nextEvents = [...previousEvents, eventToRedo];
    const previousVersion = previousEvents.length;

    const result = await repository.appendEvents(gameId, [eventToRedo], previousVersion);
    if (result.outcome === "conflict") {
      throw new Error(
        `Write conflict while redoing: expected version ${previousVersion}, storage is at ${result.currentVersion}`,
      );
    }

    setData({ status: "ready", state: nextState, events: nextEvents });
    setRedoStack(remainingStack);
    setLastUndone(null);

    try {
      await maybeSaveSnapshot(repository, gameId, previousVersion, result.version, nextState);
    } catch {
      // Best-effort, see the equivalent comment in `dispatch`.
    }
  }, [gameId, repository]);

  const value = useMemo<GameQuery>(() => {
    switch (data.status) {
      case "loading":
        return { status: "loading" };
      case "error":
        return { status: "error", error: data.error, retry };
      case "empty":
        return { status: "empty", retry };
      case "ready":
        return {
          status: "ready",
          state: data.state,
          dispatch,
          undo,
          redo,
          canUndo: data.events.length > undoFloor(data.events),
          canRedo: redoStack.length > 0,
          lastUndone,
        };
    }
  }, [data, dispatch, undo, redo, redoStack, lastUndone, retry]);

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
