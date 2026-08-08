"use client";

import {
  bustProbability,
  gameWinners,
  isRoundOver,
  legalActions,
  nextResolution,
  remainingDeck,
} from "@flip-7/engine";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { totalRemainingCards } from "@/lib/cardCatalog";
import { findCardDealtEvent } from "@/lib/cardCorrection";
import { createGame } from "@/lib/createGame";
import { triggerFeedback } from "@/lib/feedback";
import { useGameRepository } from "@/lib/gameRepositoryContext";
import { buildRoundAnnouncements } from "@/lib/roundAnnouncements";
import { buildFeedbackTriggers } from "@/lib/roundFeedback";
import { nextDealerId } from "@/lib/turnOrder";
import { useWakeLock } from "@/lib/useWakeLock";

import { ActionTargetPrompt } from "./ActionTargetPrompt";
import { CardCorrectionDialog } from "./CardCorrectionDialog";
import { CardCounterPanel } from "./CardCounterPanel";
import { CardPicker } from "./CardPicker";
import { FlipThreeSequence } from "./FlipThreeSequence";
import { InitialDeal } from "./InitialDeal";
import { ManualScoreEntry } from "./ManualScoreEntry";
import { PlayerLane } from "./PlayerLane";
import { RoundSummary } from "./RoundSummary";
import { Scoreboard } from "./Scoreboard";
import { useCurrentPlayer } from "./useCurrentPlayer";
import { useInitialDeal } from "./useInitialDeal";

import type { GameQuery } from "@/lib/gameProvider";
import type {
  ActionCard,
  Card,
  Player,
  PlayerId,
  PlayerRoundStatus,
  RoundState,
} from "@flip-7/engine";

type ReadyGame = Extract<GameQuery, { status: "ready" }>;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Seeds the status-diff ref with whatever's already true when the board
 * mounts (reopening the app mid-round after someone already busted, say) —
 * without this, the first diff would compare against an empty map and see
 * every already-busted/frozen/flipped7 player as a change happening right
 * now, firing an announcement and a bust/freeze/Flip-7 vibration for
 * something that isn't actually happening this render.
 */
function initialStatuses(
  round: RoundState | null,
  players: readonly Player[],
): Map<PlayerId, PlayerRoundStatus> {
  const statuses = new Map<PlayerId, PlayerRoundStatus>();
  if (!round) return statuses;
  for (const player of players) {
    const status = round.players[player.id]?.status;
    if (status) statuses.set(player.id, status);
  }
  return statuses;
}

/**
 * The main round-play screen (#37): one lane per player, mirroring the
 * physical table, plus Hit/Stay turn progression (#69). Action targeting
 * (#70), the guided Flip Three sequence (#71) and the initial deal (#75)
 * each take over the controls area below the lanes when their resolution
 * is pending — this pass wires the normal hit-or-stay loop and round close.
 *
 * Closing a round and starting the next are separate dispatches (#77): once
 * `RoundClosed` fires, `round` and `state.cumulativeScores` still describe
 * the round that just ended (the reducer doesn't clear `currentRound`), so
 * the summary renders from them until "Continue" dispatches `RoundStarted`.
 * `justClosed` reads the tail of the event log rather than local state so
 * the summary survives a reload or an undo mid-review.
 */
export function RoundBoard({ game }: { readonly game: ReadyGame }) {
  const { state, events, dispatch, correctCard } = game;
  const router = useRouter();
  const { id: gameId } = useParams<{ id: string }>();
  const repository = useGameRepository();
  const round = state.currentRound;
  const { currentPlayerId, markTurnAction, cancelTurnAction, selectPlayer } = useCurrentPlayer(
    round,
    state.players,
  );
  const initialDeal = useInitialDeal(round, state.players);
  const [showPicker, setShowPicker] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const manualModeRoundRef = useRef<number | null>(null);
  useEffect(() => {
    if (!round) return;
    if (manualModeRoundRef.current !== round.roundNumber) {
      manualModeRoundRef.current = round.roundNumber;
      setManualMode(false);
    }
  }, [round]);
  const [busy, setBusy] = useState(false);
  const [showScoreboard, setShowScoreboard] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [correctionTarget, setCorrectionTarget] = useState<{
    readonly playerId: PlayerId;
    readonly card: Card;
  } | null>(null);
  const [correctionBusy, setCorrectionBusy] = useState(false);
  const [correctionError, setCorrectionError] = useState<string | null>(null);
  // "In progress" ends the moment RoundClosed fires, even though `round`
  // itself stays populated through the summary screen — see the doc
  // comment above on why `currentRound` isn't cleared until the next round
  // starts.
  const justClosed = events.length > 0 && events[events.length - 1]?.t === "RoundClosed";
  useWakeLock(round !== null && !justClosed);

  // Screen-reader announcements (lib/roundAnnouncements.ts) and
  // haptic/sound feedback (lib/roundFeedback.ts) for dealt cards, status
  // changes and score updates, off the same diff. Refs, not state, for the
  // "previous" snapshots: they exist purely to diff against next render,
  // never to drive one themselves.
  const previousEventsLengthRef = useRef(events.length);
  const previousStatusesRef = useRef<Map<PlayerId, PlayerRoundStatus>>(
    initialStatuses(round, state.players),
  );
  const [announcement, setAnnouncement] = useState("");
  useEffect(() => {
    const newEvents = events.slice(previousEventsLengthRef.current);
    previousEventsLengthRef.current = events.length;

    const messages = buildRoundAnnouncements({
      newEvents,
      players: state.players,
      round,
      previousStatuses: previousStatusesRef.current,
      cumulativeScores: state.cumulativeScores,
    });
    if (messages.length > 0) setAnnouncement(messages.join(" "));

    const triggers = buildFeedbackTriggers({
      newEvents,
      players: state.players,
      round,
      previousStatuses: previousStatusesRef.current,
    });
    for (const trigger of triggers) triggerFeedback(trigger);

    const nextStatuses = new Map<PlayerId, PlayerRoundStatus>();
    for (const player of state.players) {
      const status = round?.players[player.id]?.status;
      if (status) nextStatuses.set(player.id, status);
    }
    previousStatusesRef.current = nextStatuses;
  }, [events, round, state.players, state.cumulativeScores]);

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
  // Flip 7 ends the round for everyone, so it gets a shared, round-level
  // celebration rather than only a per-lane treatment — #73.
  const flipped7Player = state.players.find(
    (player) => round.players[player.id]?.status === "flipped7",
  );
  const initialDealTargetId = initialDeal.nextSeatId;
  const canEnterManualMode = round.cardsDealt.length === 0;
  const isManualRound = state.players.every(
    (player) => round.players[player.id]?.status === "manual",
  );
  const gameOver = state.status === "completed";
  const winnerIds = gameWinners(state);
  const winners = state.players.filter((player) => winnerIds.includes(player.id));
  const nextDealerIdValue = nextDealerId(state.players, round.dealerId);
  const nextDealer: Player | null =
    state.players.find((player) => player.id === nextDealerIdValue) ?? null;
  // The single source of truth for deck composition (#38) — computed once
  // per render and threaded to the picker, the counter panel and each
  // lane's bust risk, rather than each recomputing it from `events`.
  const remaining = remainingDeck(events);
  const deckExhausted = totalRemainingCards(remaining) === 0;
  const correctionEvent = correctionTarget
    ? findCardDealtEvent(events, correctionTarget.playerId, correctionTarget.card)
    : null;
  const correctionPlayerName = correctionTarget
    ? (state.players.find((player) => player.id === correctionTarget.playerId)?.name ??
      correctionTarget.playerId)
    : "";

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

  async function handleInitialDeal(playerId: PlayerId, card: Card) {
    setActionError(null);
    setBusy(true);
    try {
      await dispatch([{ t: "CardDealt", playerId, card }]);
      initialDeal.markDealt(playerId);
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleRemoveCard() {
    if (!correctionEvent) return;
    setCorrectionError(null);
    setCorrectionBusy(true);
    try {
      await correctCard(correctionEvent, null);
      setCorrectionTarget(null);
    } catch (error) {
      setCorrectionError(errorMessage(error));
    } finally {
      setCorrectionBusy(false);
    }
  }

  async function handleReplaceCard(card: Card) {
    if (!correctionEvent) return;
    setCorrectionError(null);
    setCorrectionBusy(true);
    try {
      await correctCard(correctionEvent, card);
      setCorrectionTarget(null);
    } catch (error) {
      setCorrectionError(errorMessage(error));
    } finally {
      setCorrectionBusy(false);
    }
  }

  async function handleCloseRound() {
    if (!round) return;
    setActionError(null);
    setBusy(true);
    try {
      await dispatch([{ t: "RoundClosed" }]);
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleStartNextRound() {
    if (!round) return;
    const dealerId = nextDealerId(state.players, round.dealerId);
    if (!dealerId) return;
    setActionError(null);
    setBusy(true);
    try {
      const commands = deckExhausted
        ? [{ t: "DeckReshuffled" as const }, { t: "RoundStarted" as const, dealerId }]
        : [{ t: "RoundStarted" as const, dealerId }];
      await dispatch(commands);
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleRematch() {
    const firstDealer = state.players[0];
    if (!firstDealer) return;
    setActionError(null);
    setBusy(true);
    try {
      const newGameId = await createGame(
        repository,
        state.players,
        state.targetScore,
        firstDealer.id,
        state.purist,
      );
      router.push(`/game/${newGameId}`);
    } catch (error) {
      setActionError(errorMessage(error));
      setBusy(false);
    }
  }

  function handleEnterManualMode() {
    initialDeal.skip();
    setManualMode(true);
  }

  async function handleManualScores(scores: ReadonlyMap<PlayerId, number>) {
    setActionError(null);
    setBusy(true);
    try {
      await dispatch(
        Array.from(scores, ([playerId, points]) => ({
          t: "ManualScoreEntered" as const,
          playerId,
          points,
        })),
      );
      setManualMode(false);
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-3">
      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Round {round.roundNumber}</h1>
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="text-muted-foreground flex items-center justify-center text-xs underline"
            onClick={() => setShowScoreboard(true)}
          >
            Scoreboard
          </button>
          <Link
            href={`/game/${gameId}/history`}
            className="text-muted-foreground text-xs underline"
          >
            History
          </Link>
          <Link href={`/game/${gameId}/replay`} className="text-muted-foreground text-xs underline">
            Replay
          </Link>
          <span className="text-muted-foreground text-sm">Target {state.targetScore}</span>
        </div>
      </div>

      {/*
       * Tablet landscape gets a second column rather than just wider
       * single-column flow (#50): the counter panel moves out of the
       * document flow above the lanes and becomes a persistent sidebar,
       * so it doesn't cost lane width or need a collapse toggle once
       * there's room to show it permanently.
       */}
      <div className="flex flex-1 flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {!state.purist && <CardCounterPanel remaining={remaining} className="lg:hidden" />}

          {flipped7Player && (
            <p
              role="status"
              className="border-status-flipped7 bg-status-flipped7/10 text-status-flipped7 animate-pulse rounded-lg border-2 p-2 text-center font-semibold"
            >
              ★ {flipped7Player.name} flipped 7! Round over for everyone. ★
            </p>
          )}

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
                  bustRisk={state.purist ? null : bustProbability(state, remaining, player.id)}
                  onSelect={() => selectPlayer(player.id)}
                  onLongPressCard={(card) => {
                    setCorrectionError(null);
                    setCorrectionTarget({ playerId: player.id, card });
                  }}
                />
              );
            })}
          </ul>

          {actionError && <p className="text-status-busted text-sm">{actionError}</p>}

          {canEnterManualMode && !manualMode && !roundOver && !pending && (
            <button
              type="button"
              className="text-muted-foreground self-center text-xs underline"
              onClick={handleEnterManualMode}
            >
              Enter scores manually instead
            </button>
          )}

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
                remaining={remaining}
                purist={state.purist}
                busy={busy}
                onDeal={(card) => void handleForcedDraw(pending.playerId, card)}
              />
            ) : manualMode ? (
              <ManualScoreEntry
                round={round}
                players={state.players}
                busy={busy}
                onSubmit={(scores) => void handleManualScores(scores)}
                onCancel={() => setManualMode(false)}
              />
            ) : initialDeal.active && initialDealTargetId ? (
              <InitialDeal
                round={round}
                players={state.players}
                targetPlayerId={initialDealTargetId}
                remaining={remaining}
                purist={state.purist}
                busy={busy}
                onDeal={(card) => void handleInitialDeal(initialDealTargetId, card)}
                onSkip={initialDeal.skip}
              />
            ) : justClosed ? (
              <RoundSummary
                round={round}
                players={state.players}
                cumulativeScores={state.cumulativeScores}
                busy={busy}
                gameOver={gameOver}
                winners={winners}
                nextDealer={nextDealer}
                deckExhausted={deckExhausted}
                onContinue={() => void handleStartNextRound()}
                onRematch={() => void handleRematch()}
              />
            ) : roundOver ? (
              <div className="flex flex-col items-center gap-2">
                {unusedSecondChanceHolders.length > 0 && (
                  <p className="text-card-action text-center text-xs">
                    Unused Second Chance{unusedSecondChanceHolders.length > 1 ? "s" : ""} —{" "}
                    {unusedSecondChanceHolders.join(", ")} — will be discarded, not carried over.
                  </p>
                )}
                <div className="flex items-center gap-3">
                  <button type="button" onClick={() => void handleCloseRound()} disabled={busy}>
                    Close round
                  </button>
                  {isManualRound && (
                    <button
                      type="button"
                      className="text-muted-foreground text-xs underline"
                      onClick={() => setManualMode(true)}
                    >
                      Edit scores
                    </button>
                  )}
                </div>
              </div>
            ) : currentPlayerId && currentLegal ? (
              <>
                {showPicker ? (
                  <CardPicker
                    cardsDealt={round.cardsDealt}
                    remaining={remaining}
                    purist={state.purist}
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
              <p className="text-muted-foreground text-center text-sm">
                Waiting for an active player…
              </p>
            )}
          </div>
        </div>

        {!state.purist && (
          <CardCounterPanel
            remaining={remaining}
            persistent
            className="hidden lg:block lg:w-72 lg:shrink-0"
          />
        )}
      </div>

      {correctionTarget && correctionEvent && (
        <CardCorrectionDialog
          target={correctionEvent}
          playerName={correctionPlayerName}
          round={round}
          remaining={remaining}
          purist={state.purist}
          busy={correctionBusy}
          error={correctionError}
          onRemove={() => void handleRemoveCard()}
          onReplace={(card) => void handleReplaceCard(card)}
          onCancel={() => setCorrectionTarget(null)}
        />
      )}

      {showScoreboard && (
        <Scoreboard
          players={state.players}
          cumulativeScores={state.cumulativeScores}
          targetScore={state.targetScore}
          purist={state.purist}
          onClose={() => setShowScoreboard(false)}
        />
      )}
    </div>
  );
}
