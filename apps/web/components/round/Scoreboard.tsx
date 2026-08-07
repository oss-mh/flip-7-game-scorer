"use client";

import { joinNames } from "@/lib/format";

import type { Player, PlayerId } from "@flip-7/engine";

/**
 * Cumulative standings (#80), an overlay so it's reachable from anywhere on
 * the round board — mid-deal, mid-summary, whatever's on screen — without
 * navigating away and losing that place, per its acceptance criteria.
 * Sorted by cumulative score, each with a progress bar toward the target;
 * the leader's distance from target is called out separately since it's
 * what changes how the table plays the last round.
 */
export function Scoreboard({
  players,
  cumulativeScores,
  targetScore,
  purist,
  onClose,
}: {
  readonly players: readonly Player[];
  readonly cumulativeScores: Readonly<Record<PlayerId, number>>;
  readonly targetScore: number;
  /** Whether counting aids are switched off for this game (#40) — shown here so everyone at the table knows which mode is in play. */
  readonly purist: boolean;
  readonly onClose: () => void;
}) {
  const standings = [...players]
    .map((player) => ({ player, score: cumulativeScores[player.id] ?? 0 }))
    .sort((a, b) => b.score - a.score);

  const topScore = standings[0]?.score ?? 0;
  const leaders = standings.filter((entry) => entry.score === topScore);
  const leaderNames = joinNames(leaders.map((entry) => entry.player.name));
  const pointsFromTarget = Math.max(0, targetScore - topScore);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Scoreboard"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 sm:items-center"
    >
      <div className="border-border bg-surface flex w-full max-w-sm flex-col gap-3 rounded-lg border p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">Scoreboard</h2>
            {purist && (
              <span
                className="text-muted-foreground rounded-full border border-border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide"
                title="Counting aids are switched off for this game"
              >
                Purist mode
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground min-h-0! min-w-0! text-xs underline"
          >
            Close
          </button>
        </div>

        {leaderNames && (
          <p className="text-muted-foreground text-xs">
            {pointsFromTarget > 0
              ? `${leaderNames} ${leaders.length > 1 ? "need" : "needs"} ${pointsFromTarget} more to reach ${targetScore}.`
              : `${leaderNames} ${leaders.length > 1 ? "have" : "has"} reached ${targetScore}.`}
          </p>
        )}

        <ul className="flex flex-col gap-3">
          {standings.map(({ player, score }, index) => {
            const percent = Math.min(100, Math.round((score / targetScore) * 100));
            return (
              <li key={player.id} className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">
                    {index + 1}. {player.name}
                  </span>
                  <span className="font-semibold tabular-nums">{score}</span>
                </div>
                <div className="bg-border h-2 w-full overflow-hidden rounded-full">
                  <div
                    className="bg-status-active h-full rounded-full"
                    style={{ width: `${percent}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
