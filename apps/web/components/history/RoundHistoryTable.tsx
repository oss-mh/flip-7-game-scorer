"use client";

import { scoreRound } from "@flip-7/engine";
import { useState } from "react";

import { STATUS_META, StatusBadge } from "../round/StatusBadge";

import { RoundHistoryDetail } from "./RoundHistoryDetail";

import type { Player, PlayerId, RoundHistoryEntry } from "@flip-7/engine";

interface Selection {
  readonly roundNumber: number;
  readonly playerId: PlayerId;
}

function dealerName(players: readonly Player[], dealerId: PlayerId): string {
  return players.find((player) => player.id === dealerId)?.name ?? dealerId;
}

/**
 * Rounds down the rows, players across the columns — the shape of a paper
 * scoresheet. Each cell shows that round's own score with the running
 * cumulative total beneath it; busts and Flip 7s get the same icon
 * `StatusBadge` uses elsewhere (#73's colourblind-safe convention), not a
 * colour alone. Tapping a cell opens `RoundHistoryDetail` for that round's
 * cards and breakdown. Horizontally scrollable on its own so a table wider
 * than the screen (many players) never forces the whole page to scroll
 * sideways.
 */
export function RoundHistoryTable({
  entries,
  players,
}: {
  readonly entries: readonly RoundHistoryEntry[];
  readonly players: readonly Player[];
}) {
  const [selection, setSelection] = useState<Selection | null>(null);
  const selectedEntry = selection
    ? entries.find((entry) => entry.round.roundNumber === selection.roundNumber)
    : undefined;
  const selectedPlayer = selection
    ? players.find((player) => player.id === selection.playerId)
    : undefined;
  const selectedPlayerRound = selectedEntry && selection ? selectedEntry.round.players[selection.playerId] : undefined;

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-max border-collapse text-sm">
          <thead>
            <tr>
              <th className="text-muted-foreground p-2 text-left font-medium">Round</th>
              {players.map((player) => (
                <th key={player.id} className="text-muted-foreground p-2 text-right font-medium">
                  {player.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.round.roundNumber} className="border-border border-t">
                <td className="text-muted-foreground p-2 align-top">
                  <span className="block font-medium">{entry.round.roundNumber}</span>
                  <span className="block text-xs">{dealerName(players, entry.round.dealerId)}</span>
                </td>
                {players.map((player) => {
                  const playerRound = entry.round.players[player.id];
                  if (!playerRound) {
                    return <td key={player.id} className="p-2" />;
                  }
                  const score = scoreRound(playerRound);
                  const runningTotal = entry.runningTotals[player.id] ?? 0;
                  const flagged = playerRound.status === "busted" || playerRound.status === "flipped7";
                  return (
                    <td key={player.id} className="p-1 text-right align-top">
                      <button
                        type="button"
                        className="hover:bg-border/40 flex w-full flex-col items-end justify-center gap-0.5 rounded-md p-1.5"
                        onClick={() =>
                          setSelection({ roundNumber: entry.round.roundNumber, playerId: player.id })
                        }
                        aria-label={`${player.name}, round ${entry.round.roundNumber}: ${score.total} points, ${STATUS_META[playerRound.status].label}`}
                      >
                        <span
                          className={[
                            "font-semibold tabular-nums",
                            playerRound.status === "busted" ? "text-status-busted line-through" : "",
                            playerRound.status === "flipped7" ? "text-status-flipped7" : "",
                          ].join(" ")}
                        >
                          {score.total}
                        </span>
                        <span className="text-muted-foreground text-xs tabular-nums">
                          {runningTotal}
                        </span>
                        {flagged && <StatusBadge status={playerRound.status} />}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedEntry && selectedPlayer && selectedPlayerRound && (
        <RoundHistoryDetail
          roundNumber={selectedEntry.round.roundNumber}
          player={selectedPlayer}
          playerRound={selectedPlayerRound}
          onClose={() => setSelection(null)}
        />
      )}
    </>
  );
}
