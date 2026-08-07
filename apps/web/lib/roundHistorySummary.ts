import { scoreRound } from "@flip-7/engine";

import type { Player, RoundHistoryEntry } from "@flip-7/engine";

/**
 * Plain-text scoresheet for sharing — one block per round, each player's
 * round delta and running total, busts/Flip 7s called out the same way
 * `StatusBadge` flags them on screen. Built from `roundHistory`'s entries
 * and `scoreRound` rather than re-walking events, so this never re-derives
 * a score the engine already worked out (AGENTS.md invariant #5).
 */
export function formatRoundHistoryText(
  players: readonly Player[],
  targetScore: number,
  entries: readonly RoundHistoryEntry[],
): string {
  const lines: string[] = [`Flip 7 — round history (target ${targetScore})`, ""];

  for (const entry of entries) {
    const dealer = players.find((player) => player.id === entry.round.dealerId)?.name;
    lines.push(`Round ${entry.round.roundNumber}${dealer ? ` — ${dealer} dealt` : ""}`);

    for (const player of players) {
      const playerRound = entry.round.players[player.id];
      if (!playerRound) continue;
      const { total } = scoreRound(playerRound);
      const runningTotal = entry.runningTotals[player.id] ?? 0;
      const flag =
        playerRound.status === "busted"
          ? " (bust)"
          : playerRound.status === "flipped7"
            ? " (Flip 7!)"
            : "";
      lines.push(`  ${player.name}: +${total} -> ${runningTotal}${flag}`);
    }
    lines.push("");
  }

  const final = entries[entries.length - 1];
  if (final) {
    const standings = [...players]
      .map((player) => ({ player, total: final.runningTotals[player.id] ?? 0 }))
      .sort((a, b) => b.total - a.total);
    lines.push(
      `Standings: ${standings.map(({ player, total }) => `${player.name} ${total}`).join(", ")}`,
    );
  }

  return lines.join("\n").trimEnd();
}
