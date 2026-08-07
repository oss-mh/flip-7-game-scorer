"use client";

import { nextResolution } from "@flip-7/engine";

import { cardLabel } from "@/lib/cardCatalog";

import { ReplayPlayerCard } from "./ReplayPlayerCard";

import type { GameState, PendingResolution, Player, PlayerId } from "@flip-7/engine";

function playerName(players: readonly Player[], playerId: PlayerId): string {
  return players.find((player) => player.id === playerId)?.name ?? playerId;
}

function describePending(resolution: PendingResolution, players: readonly Player[]): string {
  switch (resolution.kind) {
    case "awaiting-target":
      return `${playerName(players, resolution.sourcePlayerId)} revealed ${cardLabel(resolution.card)} — choosing a target`;
    case "forced-draw-remaining":
      return `Flip Three — ${resolution.cardsRemaining} more card${resolution.cardsRemaining === 1 ? "" : "s"} owed to ${playerName(players, resolution.playerId)}`;
    case "second-chance-reassignment":
      return `Second Chance from ${playerName(players, resolution.fromPlayerId)} — being passed on`;
  }
}

/**
 * Read-only rendering of `state` at whatever point `ReplayViewer` has
 * scrubbed to — one lane per player, mirroring the live board's layout
 * (#37) so the replay reads as "the same table," just paused. Never reads
 * `dispatch`/`undo`/`correctCard` and has no controls of its own beyond
 * what `ReplayControls` provides — see #85's "read-only" acceptance
 * criterion.
 */
export function ReplayBoard({ state }: { readonly state: GameState }) {
  const round = state.currentRound;
  const pending = nextResolution(state);

  return (
    <div className="flex flex-1 flex-col gap-3">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">
          {round ? `Round ${round.roundNumber}` : "Before round 1"}
        </span>
        <span className="text-muted-foreground">
          {state.players
            .map((player) => `${player.name} ${state.cumulativeScores[player.id] ?? 0}`)
            .join(" · ")}
        </span>
      </div>

      {pending && (
        <p className="border-card-action bg-card-action/10 text-card-action rounded-lg border-2 p-2 text-center text-sm">
          {describePending(pending, state.players)}
        </p>
      )}

      {round ? (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {state.players.map((player) => {
            const playerRound = round.players[player.id];
            if (!playerRound) return null;
            return (
              <ReplayPlayerCard
                key={player.id}
                player={player}
                playerRound={playerRound}
                isDealer={player.id === round.dealerId}
              />
            );
          })}
        </ul>
      ) : (
        <p className="text-muted-foreground text-center text-sm">
          {state.players.length > 0
            ? "Game created — no round started yet."
            : "Nothing has happened yet."}
        </p>
      )}
    </div>
  );
}
