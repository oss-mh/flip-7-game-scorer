"use client";

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
    <div className="flex flex-1 items-center justify-center">
      <main className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">
          Round {game.state.roundNumber}
        </h1>
        <p className="text-muted-foreground">Round play — coming soon.</p>
      </main>
    </div>
  );
}
