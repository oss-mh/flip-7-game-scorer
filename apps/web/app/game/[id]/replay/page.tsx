"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import { GameRecoveryPanel } from "@/components/GameRecoveryPanel";
import { ReplayViewer } from "@/components/replay/ReplayViewer";
import { useGame } from "@/lib/gameProvider";

export default function GameReplayPage() {
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

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-center justify-between p-3 pb-0">
        <h1 className="text-xl font-semibold tracking-tight">Replay</h1>
        <Link href={`/game/${id}`} className="text-muted-foreground text-xs underline">
          Back to game
        </Link>
      </div>
      <ReplayViewer events={game.events} />
    </div>
  );
}
