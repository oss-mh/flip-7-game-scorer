"use client";

import { scoreRound } from "@flip-7/engine";

import { ScoreBreakdownLine } from "./ScoreBreakdownLine";
import { StatusBadge } from "./StatusBadge";

import type { Player, PlayerId, RoundState } from "@flip-7/engine";

/**
 * Shown once a round is closed (the log's last event is `RoundClosed`) and
 * before `RoundStarted` fires for the next round — `round` and
 * `cumulativeScores` still describe the round that just ended, since
 * `RoundClosed` banks scores but doesn't clear `currentRound` (#77). Reuses
 * `scoreRound` and `ScoreBreakdownLine` rather than recomputing anything, so
 * this never duplicates rules the engine already decided — AGENTS.md
 * invariant #5.
 */
export function RoundSummary({
  round,
  players,
  cumulativeScores,
  busy,
  onContinue,
}: {
  readonly round: RoundState;
  readonly players: readonly Player[];
  readonly cumulativeScores: Readonly<Record<PlayerId, number>>;
  readonly busy: boolean;
  readonly onContinue: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-center text-lg font-semibold">Round {round.roundNumber} complete</h2>
      <ul className="flex flex-col gap-2">
        {players.map((player) => {
          const playerRound = round.players[player.id];
          if (!playerRound) return null;
          const score = scoreRound(playerRound);
          const newTotal = cumulativeScores[player.id] ?? 0;
          const deltaClass =
            playerRound.status === "busted"
              ? "text-status-busted"
              : playerRound.status === "flipped7"
                ? "text-status-flipped7"
                : "text-status-active";
          return (
            <li
              key={player.id}
              className="border-border flex items-center justify-between gap-2 rounded-lg border-2 p-3"
            >
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{player.name}</span>
                  <StatusBadge status={playerRound.status} />
                </div>
                <ScoreBreakdownLine score={score} />
              </div>
              <div className="flex flex-col items-end">
                <span className={`text-sm font-medium ${deltaClass}`}>+{score.total}</span>
                <span className="text-lg font-semibold tabular-nums">{newTotal}</span>
              </div>
            </li>
          );
        })}
      </ul>
      <button type="button" onClick={onContinue} disabled={busy}>
        Start round {round.roundNumber + 1}
      </button>
    </div>
  );
}
