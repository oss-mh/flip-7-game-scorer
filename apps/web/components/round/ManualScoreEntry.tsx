"use client";

import { useState } from "react";

import { seatOrderFromDealer } from "@/lib/turnOrder";

import { NumericKeypad } from "./NumericKeypad";

import type { Player, PlayerId, RoundState } from "@flip-7/engine";

function playerName(players: readonly Player[], playerId: PlayerId): string {
  return players.find((player) => player.id === playerId)?.name ?? playerId;
}

/**
 * Numeric-keypad entry for a whole round's scores at once (#78), for tables
 * that would rather play at full speed and record the result than track
 * every card. Seeded from each player's existing `manualScore` so reopening
 * this after a round is already fully entered edits it in place rather than
 * starting blank — the same overwrite-on-resubmit the reducer expects (see
 * `applyManualScoreEntered`).
 */
export function ManualScoreEntry({
  round,
  players,
  busy,
  onSubmit,
  onCancel,
}: {
  readonly round: RoundState;
  readonly players: readonly Player[];
  readonly busy: boolean;
  readonly onSubmit: (scores: ReadonlyMap<PlayerId, number>) => void;
  readonly onCancel: () => void;
}) {
  const seatOrder = seatOrderFromDealer(players, round.dealerId);
  const [values, setValues] = useState<Partial<Record<PlayerId, string>>>(() => {
    const initial: Partial<Record<PlayerId, string>> = {};
    for (const playerId of seatOrder) {
      const manualScore = round.players[playerId]?.manualScore;
      if (manualScore !== null && manualScore !== undefined) {
        initial[playerId] = String(manualScore);
      }
    }
    return initial;
  });
  const [activeIndex, setActiveIndex] = useState(0);

  const activePlayerId = seatOrder[activeIndex] ?? null;
  const allEntered = seatOrder.every((playerId) => (values[playerId] ?? "") !== "");

  function appendDigit(digit: string) {
    if (!activePlayerId) return;
    setValues((previous) => {
      const current = previous[activePlayerId] ?? "";
      const next = current === "0" ? digit : current + digit;
      return { ...previous, [activePlayerId]: next };
    });
  }

  function backspace() {
    if (!activePlayerId) return;
    setValues((previous) => ({
      ...previous,
      [activePlayerId]: (previous[activePlayerId] ?? "").slice(0, -1),
    }));
  }

  function goToNextPlayer() {
    setActiveIndex((index) => (index + 1) % seatOrder.length);
  }

  function handleSubmit() {
    const scores = new Map<PlayerId, number>();
    for (const playerId of seatOrder) {
      scores.set(playerId, Number(values[playerId] ?? 0));
    }
    onSubmit(scores);
  }

  return (
    <div className="border-border bg-surface flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground text-xs">Enter each player&apos;s round score</span>
        <button
          type="button"
          className="text-muted-foreground text-xs underline"
          onClick={onCancel}
        >
          Back to tracked play
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {seatOrder.map((playerId, index) => {
          const isActive = index === activeIndex;
          return (
            <button
              key={playerId}
              type="button"
              aria-pressed={isActive}
              onClick={() => setActiveIndex(index)}
              className={[
                "text-status-manual flex min-w-20 flex-col items-center gap-1 rounded-lg border-2 px-3 py-2",
                isActive ? "border-status-manual" : "border-border",
              ].join(" ")}
            >
              <span className="text-foreground flex items-center gap-1 text-xs">
                {isActive && <span aria-hidden="true">✎</span>}
                {playerName(players, playerId)}
              </span>
              <span className="text-lg font-semibold tabular-nums">{values[playerId] ?? "–"}</span>
            </button>
          );
        })}
      </div>

      <NumericKeypad
        onDigit={appendDigit}
        onBackspace={backspace}
        extraKeys={["Next"]}
        onExtraKey={goToNextPlayer}
        disabled={busy}
      />

      <button type="button" disabled={busy || !allEntered} onClick={handleSubmit}>
        Save scores
      </button>
    </div>
  );
}
