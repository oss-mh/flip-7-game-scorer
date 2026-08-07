"use client";

import type { PlayerLifetimeStats } from "@flip-7/engine";

/**
 * Ranked by wins, then win rate, then games played, so ties break on
 * something meaningful rather than array order. Tapping a name opens that
 * player's detail (score distribution + risk appetite) via `onSelectPlayer`.
 */
export function Leaderboard({
  stats,
  onSelectPlayer,
}: {
  readonly stats: readonly PlayerLifetimeStats[];
  readonly onSelectPlayer: (name: string) => void;
}) {
  const ranked = [...stats].sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    const winRateA = a.gamesPlayed > 0 ? a.wins / a.gamesPlayed : 0;
    const winRateB = b.gamesPlayed > 0 ? b.wins / b.gamesPlayed : 0;
    if (winRateB !== winRateA) return winRateB - winRateA;
    return b.gamesPlayed - a.gamesPlayed;
  });

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-max border-collapse text-sm">
        <thead>
          <tr>
            <th className="text-muted-foreground p-2 text-left font-medium">Player</th>
            <th className="text-muted-foreground p-2 text-right font-medium">Games</th>
            <th className="text-muted-foreground p-2 text-right font-medium">Wins</th>
            <th className="text-muted-foreground p-2 text-right font-medium">Avg score</th>
            <th className="text-muted-foreground p-2 text-right font-medium">Bust rate</th>
            <th className="text-muted-foreground p-2 text-right font-medium">Flip 7s</th>
          </tr>
        </thead>
        <tbody>
          {ranked.map((entry) => (
            <tr key={entry.name} className="border-border border-t">
              <td className="p-2">
                <button
                  type="button"
                  className="min-h-0! min-w-0! text-left font-medium underline"
                  onClick={() => onSelectPlayer(entry.name)}
                >
                  {entry.name}
                </button>
              </td>
              <td className="p-2 text-right tabular-nums">{entry.gamesPlayed}</td>
              <td className="p-2 text-right tabular-nums">{entry.wins}</td>
              <td className="p-2 text-right tabular-nums">{entry.averageRoundScore.toFixed(1)}</td>
              <td className="p-2 text-right tabular-nums">{Math.round(entry.bustRate * 100)}%</td>
              <td className="p-2 text-right tabular-nums">{entry.flip7Count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
