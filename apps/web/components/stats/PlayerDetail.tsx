"use client";

import { riskAppetite } from "@/lib/riskAppetite";

import { ScoreDistributionChart } from "./ScoreDistributionChart";

import type { RiskAppetiteLevel } from "@/lib/riskAppetite";
import type { PlayerLifetimeStats } from "@flip-7/engine";

const RISK_CLASSES: Record<RiskAppetiteLevel, string> = {
  aggressive: "text-status-busted border-status-busted/60",
  balanced: "text-status-active border-status-active/60",
  cautious: "text-status-stayed border-status-stayed/60",
  "insufficient-data": "text-muted-foreground border-border",
};

function Stat({ label, value }: { readonly label: string; readonly value: string | number }) {
  return (
    <div className="flex flex-col">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

/**
 * A player's lifetime detail: the stat grid `lifetimePlayerStats` already
 * computed, a risk-appetite label derived from it (#43's acceptance
 * criterion), and the score-distribution chart built from
 * `playerRoundScores`'s raw values.
 */
export function PlayerDetail({
  stats,
  scores,
  onClose,
}: {
  readonly stats: PlayerLifetimeStats;
  readonly scores: readonly number[];
  readonly onClose: () => void;
}) {
  const risk = riskAppetite(stats);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${stats.name} — lifetime stats`}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 sm:items-center"
    >
      <div className="border-border bg-surface flex w-full max-w-sm flex-col gap-4 rounded-lg border p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">{stats.name}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground min-h-0! min-w-0! text-xs underline"
          >
            Close
          </button>
        </div>

        <div className="flex flex-col gap-1">
          <span
            className={`w-fit rounded-full border px-2 py-0.5 text-xs font-medium ${RISK_CLASSES[risk.level]}`}
          >
            {risk.label}
          </span>
          <p className="text-muted-foreground text-xs">{risk.description}</p>
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <Stat label="Games played" value={stats.gamesPlayed} />
          <Stat label="Wins" value={stats.wins} />
          <Stat label="Rounds played" value={stats.roundsPlayed} />
          <Stat label="Bust rate" value={`${Math.round(stats.bustRate * 100)}%`} />
          <Stat label="Avg round score" value={stats.averageRoundScore.toFixed(1)} />
          <Stat label="Flip 7s" value={stats.flip7Count} />
          <Stat
            label="Avg hits before staying"
            value={
              stats.averageHitsBeforeStaying !== null
                ? stats.averageHitsBeforeStaying.toFixed(1)
                : "—"
            }
          />
        </dl>

        <div>
          <h3 className="text-muted-foreground mb-2 text-xs tracking-wide uppercase">
            Score distribution
          </h3>
          <ScoreDistributionChart scores={scores} />
        </div>
      </div>
    </div>
  );
}
