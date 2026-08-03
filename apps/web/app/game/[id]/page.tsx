"use client";

import { describeEvent } from "@/lib/describeEvent";
import { useGame } from "@/lib/gameProvider";

export default function GamePage() {
  const game = useGame();

  if (game.status === "loading") {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-muted-foreground">Loading game…</p>
      </div>
    );
  }

  if (game.status === "error") {
    return (
      <div className="flex flex-1 items-center justify-center">
        <main className="flex flex-col items-center gap-2 text-center">
          <p className="text-status-busted">{game.error.message}</p>
          <button onClick={game.retry}>Retry</button>
        </main>
      </div>
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
    <div className="flex flex-1 flex-col items-center justify-center gap-4">
      {game.lastUndone && (
        <p className="text-muted-foreground text-sm" role="status">
          Undid: {describeEvent(game.lastUndone, game.state.players)}
        </p>
      )}
      <main className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">Round {game.state.roundNumber}</h1>
        <p className="text-muted-foreground">Round play — coming soon.</p>
      </main>
      <div className="flex gap-2">
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
