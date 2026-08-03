"use client";

import { nextResolution } from "@flip-7/engine";
import { useEffect, useMemo, useRef, useState } from "react";

import { nextActiveSeatIndex, seatOrderFromDealer } from "@/lib/turnOrder";

import type { GameState, Player, PlayerId, RoundState } from "@flip-7/engine";

/**
 * Tracks "whose turn is it" for the Hit/Stay controls (#69). Purely a UI
 * sequencing convenience — the engine has no turn-order concept, so nothing
 * here ever gates legality, only which lane the primary controls act on.
 */
export function useCurrentPlayer(
  round: RoundState | null,
  players: readonly Player[],
): {
  readonly currentPlayerId: PlayerId | null;
  /** Call once after a Hit or Stay dispatch resolves, passing the resulting state. */
  readonly advanceAfter: (nextState: GameState) => void;
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

  // Catches the deferred case: a Hit revealed an action card, so the
  // advance was held back until whatever it queued (a target prompt, a
  // Flip Three) fully drains from the resolution queue.
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

  function advanceAfter(nextState: GameState): void {
    const nextRound = nextState.currentRound;
    if (!nextRound) return;
    if (nextResolution(nextState) === null) {
      setPointerIndex((index) => {
        const next = nextActiveSeatIndex(nextRound, seatOrder, index + 1);
        return next === -1 ? index : next;
      });
    } else {
      pendingAdvanceRef.current = true;
    }
  }

  function selectPlayer(playerId: PlayerId): void {
    const index = seatOrder.indexOf(playerId);
    if (index !== -1) {
      pendingAdvanceRef.current = false;
      setPointerIndex(index);
    }
  }

  return { currentPlayerId, advanceAfter, selectPlayer };
}
