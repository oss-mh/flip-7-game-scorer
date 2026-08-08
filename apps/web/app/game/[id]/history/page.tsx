"use client";

import { roundHistory } from "@flip-7/engine";
import Link from "next/link";
import { useParams } from "next/navigation";

import { GameRecoveryPanel } from "@/components/GameRecoveryPanel";
import { RoundHistoryTable } from "@/components/history/RoundHistoryTable";
import { ShareSummaryButton } from "@/components/history/ShareSummaryButton";
import { useGame } from "@/lib/gameProvider";
import { formatRoundHistoryText } from "@/lib/roundHistorySummary";

export default function GameHistoryPage() {
  const { id } = useParams<{ id: string }>();
  const game = useGame();

  if (game.status === "loading") {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-muted-foreground">Loading game…</p>
      </div>
    );
  }

  if (game.status === "error") {
    return <GameRecoveryPanel error={game.error} gameId={id} onReload={game.retry} />;
  }

  if (game.status === "degraded") {
    return (
      <GameRecoveryPanel
        error={game.error}
        gameId={id}
        degradedState={game.state}
        onReload={game.retry}
      />
    );
  }

  if (game.status === "empty") {
    return (
      <div className="flex flex-1 items-center justify-center">
        <main className="flex flex-col items-center gap-2 text-center">
          <p className="text-muted-foreground">This game has no recorded events yet.</p>
          <button onClick={game.retry}>Retry</button>
        </main>
      </div>
    );
  }

  const entries = roundHistory(game.events);

  return (
    <div className="flex flex-1 flex-col gap-4 p-3">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Round history</h1>
        <Link href={`/game/${id}`} className="text-muted-foreground text-xs underline">
          Back to game
        </Link>
      </div>

      {entries.length === 0 ? (
        <p className="text-muted-foreground text-center">No rounds have been closed yet.</p>
      ) : (
        <>
          <RoundHistoryTable entries={entries} players={game.state.players} />
          <ShareSummaryButton
            text={formatRoundHistoryText(game.state.players, game.state.targetScore, entries)}
          />
        </>
      )}
    </div>
  );
}
