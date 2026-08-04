"use client";

import { scoreRound } from "@flip-7/engine";

import { joinNames } from "@/lib/format";

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
 * invariant #5. When the round that just closed also ended the game (#81 —
 * `gameOver`/`winners` come from the engine's own `status`/`gameWinners`,
 * never re-derived here), the "start next round" action is replaced with
 * final standings and a rematch action instead. Otherwise the continue
 * button names the next dealer up front (#82) — the seat one left of this
 * round's, already the rule `RoundStarted` itself enforces — and, if the
 * tracked deck has been fully dealt out since the last reshuffle, prompts
 * for one instead of silently continuing on an empty deck.
 */
export function RoundSummary({
  round,
  players,
  cumulativeScores,
  busy,
  gameOver,
  winners,
  nextDealer,
  deckExhausted,
  onContinue,
  onRematch,
}: {
  readonly round: RoundState;
  readonly players: readonly Player[];
  readonly cumulativeScores: Readonly<Record<PlayerId, number>>;
  readonly busy: boolean;
  readonly gameOver: boolean;
  readonly winners: readonly Player[];
  readonly nextDealer: Player | null;
  readonly deckExhausted: boolean;
  readonly onContinue: () => void;
  readonly onRematch: () => void;
}) {
  const finalStandings = gameOver
    ? [...players]
        .map((player) => ({ player, score: cumulativeScores[player.id] ?? 0 }))
        .sort((a, b) => b.score - a.score)
    : [];

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

      {gameOver ? (
        <div className="border-status-flipped7 bg-status-flipped7/10 flex flex-col items-center gap-3 rounded-lg border-2 p-3">
          <p className="text-status-flipped7 text-center font-semibold">
            ★ {joinNames(winners.map((winner) => winner.name))}{" "}
            {winners.length > 1 ? "tie for the win" : "wins"}! ★
          </p>
          <ol className="flex w-full flex-col gap-1">
            {finalStandings.map(({ player, score }, index) => (
              <li key={player.id} className="flex items-center justify-between text-sm">
                <span>
                  {index + 1}. {player.name}
                </span>
                <span className="font-semibold tabular-nums">{score}</span>
              </li>
            ))}
          </ol>
          <button type="button" onClick={onRematch} disabled={busy}>
            Rematch
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2">
          {deckExhausted && (
            <p className="text-card-action text-center text-xs">
              The tracked deck is exhausted — reshuffling before the next round.
            </p>
          )}
          <button type="button" onClick={onContinue} disabled={busy}>
            {deckExhausted ? "Reshuffle & start" : "Start"} round {round.roundNumber + 1}
            {nextDealer && ` — ${nextDealer.name} deals`}
          </button>
        </div>
      )}
    </div>
  );
}
