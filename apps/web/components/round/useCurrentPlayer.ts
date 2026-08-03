"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { nextActiveSeatIndex, seatOrderFromDealer } from "@/lib/turnOrder";

import type { Player, PlayerId, RoundState } from "@flip-7/engine";

/**
 * Tracks "whose turn is it" for the Hit/Stay controls (#69). Purely a UI
 * sequencing convenience — the engine has no turn-order concept, so nothing
 * here ever gates legality, only which lane the primary controls act on.
 *
 * `markTurnAction` must be called synchronously when a Hit or Stay is
 * initiated, *before* `dispatch` — not after it resolves. `dispatch`
 * returns `void`, and by the time an `await dispatch(...)` in the caller
 * settles, the round may already have re-rendered past the transition this
 * hook needs to observe. Setting the flag up front means the effect below
 * catches it on whichever render first reflects the outcome, whether that
 * lands immediately (a plain number card) or only once a spawned
 * resolution — a target prompt, a Flip Three — fully drains.
 */
export function useCurrentPlayer(
  round: RoundState | null,
  players: readonly Player[],
): {
  readonly currentPlayerId: PlayerId | null;
  readonly markTurnAction: () => void;
  /** Clears a turn-action mark after its dispatch failed, so a later unrelated resolution doesn't inherit it. */
  readonly cancelTurnAction: () => void;
  /** Lets the operator jump the turn pointer directly to a lane, for out-of-order dealing. */
  readonly selectPlayer: (playerId: PlayerId) => void;
} {
  const seatOrder = useMemo(
    () => (round ? seatOrderFromDealer(players, round.dealerId) : []),
    [players, round],
  );

  const [pointerIndex, setPointerIndex] = useState(0);
  const roundNumberRef = useRef<number | null>(null);
  const pendingAdvanceRef = useRef(false);

  useEffect(() => {
    if (!round) return;
    if (roundNumberRef.current !== round.roundNumber) {
      roundNumberRef.current = round.roundNumber;
      pendingAdvanceRef.current = false;
      setPointerIndex(0);
    }
  }, [round]);

  useEffect(() => {
    if (!round) return;
    if (pendingAdvanceRef.current && round.pendingResolutions.length === 0) {
      pendingAdvanceRef.current = false;
      setPointerIndex((index) => {
        const next = nextActiveSeatIndex(round, seatOrder, index + 1);
        return next === -1 ? index : next;
      });
    }
  }, [round, seatOrder]);

  const currentPlayerId = useMemo<PlayerId | null>(() => {
    if (!round || seatOrder.length === 0) return null;
    const index = nextActiveSeatIndex(round, seatOrder, pointerIndex);
    return index === -1 ? null : (seatOrder[index] ?? null);
  }, [round, seatOrder, pointerIndex]);

  function markTurnAction(): void {
    pendingAdvanceRef.current = true;
  }

  function cancelTurnAction(): void {
    pendingAdvanceRef.current = false;
  }

  function selectPlayer(playerId: PlayerId): void {
    const index = seatOrder.indexOf(playerId);
    if (index !== -1) {
      pendingAdvanceRef.current = false;
      setPointerIndex(index);
    }
  }

  return { currentPlayerId, markTurnAction, cancelTurnAction, selectPlayer };
}
