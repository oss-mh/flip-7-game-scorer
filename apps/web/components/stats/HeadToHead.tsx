"use client";

import { useState } from "react";

import type { HeadToHeadStats, PlayerLifetimeStats } from "@flip-7/engine";

interface CompareRow {
  readonly label: string;
  readonly valueA: string | number;
  readonly valueB: string | number;
  readonly note?: string;
}

function compareRows(stats: HeadToHeadStats): readonly CompareRow[] {
  return [
    {
      label: "Games ahead",
      valueA: stats.gameWinsA,
      valueB: stats.gameWinsB,
      note: stats.gameTies > 0 ? `${stats.gameTies} tied` : undefined,
    },
    {
      label: "Rounds won",
      valueA: stats.roundWinsA,
      valueB: stats.roundWinsB,
      note: stats.roundTies > 0 ? `${stats.roundTies} tied` : undefined,
    },
    {
      label: "Avg round score",
      valueA: stats.averageRoundScoreA.toFixed(1),
      valueB: stats.averageRoundScoreB.toFixed(1),
    },
  ];
}

function PlayerPicker({
  label,
  players,
  selected,
  onSelect,
}: {
  readonly label: string;
  readonly players: readonly PlayerLifetimeStats[];
  readonly selected: string | null;
  readonly onSelect: (name: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-muted-foreground text-xs">{label}</span>
      <div className="flex flex-wrap gap-2">
        {players.map((player) => (
          <button
            key={player.name}
            type="button"
            aria-pressed={selected === player.name}
            className={[
              "rounded border px-2 py-1 text-xs",
              selected === player.name
                ? "border-status-active text-status-active font-semibold underline"
                : "border-border text-muted-foreground",
            ].join(" ")}
            onClick={() => onSelect(player.name)}
          >
            {player.name}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Two independent player pickers plus the `headToHead` record between
 * whoever's selected, computed on demand — cheap enough at this app's scale
 * (see `lifetimeStats.ts`'s own note on caching) that there's no reason to
 * precompute every pair up front.
 */
export function HeadToHead({
  players,
  compute,
}: {
  readonly players: readonly PlayerLifetimeStats[];
  readonly compute: (playerA: string, playerB: string) => HeadToHeadStats;
}) {
  const [nameA, setNameA] = useState<string | null>(players[0]?.name ?? null);
  const [nameB, setNameB] = useState<string | null>(players[1]?.name ?? null);

  if (players.length < 2) {
    return <p className="text-muted-foreground text-sm">Need at least two players to compare.</p>;
  }

  const stats = nameA && nameB && nameA !== nameB ? compute(nameA, nameB) : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start gap-3">
        <PlayerPicker label="Player A" players={players} selected={nameA} onSelect={setNameA} />
        <PlayerPicker label="Player B" players={players} selected={nameB} onSelect={setNameB} />
      </div>

      {nameA && nameB && nameA === nameB && (
        <p className="text-muted-foreground text-sm">Pick two different players.</p>
      )}

      {stats && stats.gamesTogether === 0 && (
        <p className="text-muted-foreground text-sm">
          {nameA} and {nameB} haven&apos;t played a game together yet.
        </p>
      )}

      {stats && stats.gamesTogether > 0 && (
        <div className="border-border flex flex-col gap-2 rounded-lg border p-3">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-x-2 text-sm font-semibold">
            <span className="text-right">{nameA}</span>
            <span className="text-muted-foreground text-center text-[11px] font-normal">
              {stats.gamesTogether} game{stats.gamesTogether === 1 ? "" : "s"} together
            </span>
            <span>{nameB}</span>
          </div>
          {compareRows(stats).map((row) => (
            <div
              key={row.label}
              className="grid grid-cols-[1fr_auto_1fr] items-center gap-x-2 text-sm"
            >
              <span className="text-right font-medium tabular-nums">{row.valueA}</span>
              <span className="text-muted-foreground text-center text-[11px]">
                {row.label}
                {row.note && <span className="block">{row.note}</span>}
              </span>
              <span className="font-medium tabular-nums">{row.valueB}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
