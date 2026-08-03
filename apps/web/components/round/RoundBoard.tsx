"use client";

import { isRoundOver, legalActions, nextResolution } from "@flip-7/engine";
import { useState } from "react";

import { nextDealerId } from "@/lib/turnOrder";

import { ActionTargetPrompt } from "./ActionTargetPrompt";
import { CardPicker } from "./CardPicker";
import { FlipThreeSequence } from "./FlipThreeSequence";
import { PlayerLane } from "./PlayerLane";
import { useCurrentPlayer } from "./useCurrentPlayer";

import type { GameQuery } from "@/lib/gameProvider";
import type { ActionCard, Card, PlayerId } from "@flip-7/engine";

type ReadyGame = Extract<GameQuery, { status: "ready" }>;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * The main round-play screen (#37): one lane per player, mirroring the
 * physical table, plus Hit/Stay turn progression (#69). Action targeting
 * (#70), the guided Flip Three sequence (#71) and the initial deal (#75)
 * each take over the controls area below the lanes when their resolution
 * is pending — this pass wires the normal hit-or-stay loop and round close.
 */
export function RoundBoard({ game }: { readonly game: ReadyGame }) {
  const { state, dispatch } = game;
  const round = state.currentRound;
  const { currentPlayerId, markTurnAction, cancelTurnAction, selectPlayer } = useCurrentPlayer(
    round,
    state.players,
  );
  const [showPicker, setShowPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (!round) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-muted-foreground">No round in progress.</p>
      </div>
    );
  }

  const pending = nextResolution(state);
  const roundOver = isRoundOver(state);
  const currentLegal = currentPlayerId ? legalActions(state, currentPlayerId) : null;
  const unusedSecondChanceHolders = state.players
    .filter((player) => round.players[player.id]?.heldSecondChance)
    .map((player) => player.name);

  async function handleHitDeal(card: Card) {
    if (!currentPlayerId) return;
    setActionError(null);
    setBusy(true);
    markTurnAction();
    try {
      await dispatch([{ t: "CardDealt", playerId: currentPlayerId, card }]);
      setShowPicker(false);
    } catch (error) {
      cancelTurnAction();
      setActionError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleStay() {
    if (!currentPlayerId) return;
    setActionError(null);
    setBusy(true);
    markTurnAction();
    try {
      await dispatch([{ t: "PlayerStayed", playerId: currentPlayerId }]);
    } catch (error) {
      cancelTurnAction();
      setActionError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleResolveTarget(card: ActionCard, sourceId: PlayerId, targetId: PlayerId) {
    setActionError(null);
    setBusy(true);
    try {
      await dispatch([{ t: "ActionTargeted", card, sourceId, targetId }]);
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleForcedDraw(playerId: PlayerId, card: Card) {
    setActionError(null);
    setBusy(true);
    try {
      await dispatch([{ t: "CardDealt", playerId, card }]);
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleCloseRound() {
    if (!round) return;
    setActionError(null);
    setBusy(true);
    try {
      const dealerId = nextDealerId(state.players, round.dealerId);
      const commands = dealerId
        ? [{ t: "RoundClosed" as const }, { t: "RoundStarted" as const, dealerId }]
        : [{ t: "RoundClosed" as const }];
      await dispatch(commands);
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-3">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Round {round.roundNumber}</h1>
        <span className="text-muted-foreground text-sm">Target {state.targetScore}</span>
      </div>

      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {state.players.map((player) => {
          const playerRound = round.players[player.id];
          if (!playerRound) return null;
          return (
            <PlayerLane
              key={player.id}
              player={player}
              playerRound={playerRound}
              isDealer={player.id === round.dealerId}
              isCurrentPlayer={player.id === currentPlayerId}
              onSelect={() => selectPlayer(player.id)}
            />
          );
        })}
      </ul>

      {actionError && <p className="text-status-busted text-sm">{actionError}</p>}

      <div className="mt-auto flex flex-col gap-3">
        {pending?.kind === "awaiting-target" ? (
          <ActionTargetPrompt
            card={pending.card}
            sourcePlayerId={pending.sourcePlayerId}
            round={round}
            players={state.players}
            busy={busy}
            onResolve={(targetId) =>
              void handleResolveTarget(pending.card, pending.sourcePlayerId, targetId)
            }
          />
        ) : pending?.kind === "forced-draw-remaining" ? (
          <FlipThreeSequence
            resolution={pending}
            upNext={round.pendingResolutions.slice(1)}
            round={round}
            players={state.players}
            busy={busy}
            onDeal={(card) => void handleForcedDraw(pending.playerId, card)}
          />
        ) : roundOver ? (
          <div className="flex flex-col items-center gap-2">
            {unusedSecondChanceHolders.length > 0 && (
              <p className="text-card-action text-center text-xs">
                Unused Second Chance{unusedSecondChanceHolders.length > 1 ? "s" : ""} —{" "}
                {unusedSecondChanceHolders.join(", ")} — will be discarded, not carried over.
              </p>
            )}
            <button type="button" onClick={() => void handleCloseRound()} disabled={busy}>
              Close round &amp; deal next
            </button>
          </div>
        ) : currentPlayerId && currentLegal ? (
          <>
            {showPicker ? (
              <CardPicker
                cardsDealt={round.cardsDealt}
                playerCount={state.players.length}
                onDeal={(card) => void handleHitDeal(card)}
                disabled={busy}
              />
            ) : (
              <div className="flex gap-2">
                <button
                  type="button"
                  className="flex-1"
                  disabled={busy || !currentLegal.moves.includes("hit")}
                  onClick={() => setShowPicker(true)}
                >
                  Hit
                </button>
                <button
                  type="button"
                  className="flex-1"
                  disabled={busy || !currentLegal.moves.includes("stay")}
                  onClick={() => void handleStay()}
                  title={currentLegal.reasons.stay}
                >
                  Stay
                </button>
              </div>
            )}
          </>
        ) : (
          <p className="text-muted-foreground text-center text-sm">Waiting for an active player…</p>
        )}
      </div>
    </div>
  );
}
