"use client";

import { PlayerLane } from "./PlayerLane";
import { useCurrentPlayer } from "./useCurrentPlayer";

import type { GameQuery } from "@/lib/gameProvider";

type ReadyGame = Extract<GameQuery, { status: "ready" }>;

/**
 * The main round-play screen (#37): one lane per player, mirroring the
 * physical table. Later issues (#67–#75) add the card picker, Hit/Stay
 * controls, action targeting and guided sequences on top of this layout —
 * this pass establishes the board itself.
 */
export function RoundBoard({ game }: { readonly game: ReadyGame }) {
  const { state } = game;
  const round = state.currentRound;
  const { currentPlayerId, selectPlayer } = useCurrentPlayer(round, state.players);

  if (!round) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-muted-foreground">No round in progress.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-3">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Round {round.roundNumber}</h1>
        <span className="text-muted-foreground text-sm">Target {state.targetScore}</span>
      </div>

      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {state.players.map((player) => {
          const playerRound = round.players[player.id];
          if (!playerRound) return null;
          return (
            <PlayerLane
              key={player.id}
              player={player}
              playerRound={playerRound}
              isDealer={player.id === round.dealerId}
              isCurrentPlayer={player.id === currentPlayerId}
              onSelect={() => selectPlayer(player.id)}
            />
          );
        })}
      </ul>
    </div>
  );
}
