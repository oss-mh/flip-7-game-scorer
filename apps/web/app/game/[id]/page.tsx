"use client";

import { useParams } from "next/navigation";

import { GameRecoveryPanel } from "@/components/GameRecoveryPanel";
import { RoundBoard } from "@/components/round/RoundBoard";
import { describeEvent } from "@/lib/describeEvent";
import { useGame } from "@/lib/gameProvider";

export default function GamePage() {
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
    <div className="flex flex-1 flex-col gap-2">
      {game.lastUndone && (
        <p className="text-muted-foreground px-3 pt-2 text-sm" role="status">
          Undid: {describeEvent(game.lastUndone, game.state.players)}
        </p>
      )}
      <RoundBoard game={game} />
      <div className="flex justify-center gap-2 p-3">
        <button disabled={!game.canUndo} onClick={() => void game.undo()}>
          Undo
        </button>
        <button disabled={!game.canRedo} onClick={() => void game.redo()}>
          Redo
        </button>
      </div>
    </div>
  );
}
