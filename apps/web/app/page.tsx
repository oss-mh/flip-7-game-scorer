"use client";

import { fold } from "@flip-7/engine";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { useGameRepository } from "@/lib/gameRepositoryContext";
import { systemClock } from "@/lib/systemClock";

import type { GameMeta, GameRepository, GameState, GameStatus, Player } from "@flip-7/engine";

interface GameSummary {
  readonly id: string;
  readonly players: readonly Player[];
  readonly roundNumber: number;
  readonly status: GameStatus;
  readonly leader: { readonly name: string; readonly score: number } | null;
  readonly lastPlayedAt: string;
  readonly archivedAt: string | null;
}

type ListState =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly error: Error }
  | { readonly status: "ready"; readonly games: readonly GameSummary[] };

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

function computeLeader(
  state: GameState,
  players: readonly Player[],
): { name: string; score: number } | null {
  if (players.length === 0) return null;

  let leader = players[0];
  let leaderScore = state.cumulativeScores[leader.id] ?? 0;
  for (const player of players.slice(1)) {
    const score = state.cumulativeScores[player.id] ?? 0;
    if (score > leaderScore) {
      leader = player;
      leaderScore = score;
    }
  }
  return { name: leader.name, score: leaderScore };
}

/**
 * Full per-game fold, not the snapshot-optimized `loadGameState` — a game
 * list needs the last event's timestamp for "last played", which a
 * snapshot alone can't provide. Fine at this app's scale (a handful to a
 * few dozen local games, not thousands); see the equivalent tradeoff note
 * in gameProvider.tsx for the same reasoning.
 */
async function summarizeGame(repository: GameRepository, meta: GameMeta): Promise<GameSummary> {
  const events = await repository.loadEvents(meta.id);
  const state = fold(events);
  const lastEvent = events[events.length - 1];

  return {
    id: meta.id,
    players: meta.players,
    roundNumber: state.roundNumber,
    status: state.status,
    leader: computeLeader(state, meta.players),
    lastPlayedAt: lastEvent ? lastEvent.at : meta.createdAt,
    archivedAt: meta.archivedAt,
  };
}

function sortGames(games: readonly GameSummary[]): GameSummary[] {
  return [...games].sort((a, b) => {
    if (a.status !== b.status) return a.status === "active" ? -1 : 1;
    return b.lastPlayedAt.localeCompare(a.lastPlayedAt);
  });
}

export default function HomePage() {
  const repository = useGameRepository();
  const [state, setState] = useState<ListState>({ status: "loading" });
  const [showArchived, setShowArchived] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    repository
      .listGames()
      .then((metas) => Promise.all(metas.map((meta) => summarizeGame(repository, meta))))
      .then((games) => setState({ status: "ready", games }))
      .catch((error: unknown) => setState({ status: "error", error: toError(error) }));
  }, [repository]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function withActionErrorHandling(action: () => Promise<void>) {
    setActionError(null);
    try {
      await action();
      refresh();
    } catch (error) {
      setActionError(toError(error).message);
    }
  }

  function archiveGame(id: string) {
    void withActionErrorHandling(() => repository.archiveGame(id, systemClock.now()));
  }

  function unarchiveGame(id: string) {
    void withActionErrorHandling(() => repository.unarchiveGame(id));
  }

  function deleteGame(id: string, label: string) {
    if (!window.confirm(`Delete "${label}"? This permanently removes the game and cannot be undone.`)) {
      return;
    }
    void withActionErrorHandling(() => repository.deleteGame(id));
  }

  if (state.status === "loading") {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-muted-foreground">Loading games…</p>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-status-busted">{state.error.message}</p>
      </div>
    );
  }

  const visibleGames = state.games.filter((game) => showArchived || game.archivedAt === null);
  const archivedCount = state.games.filter((game) => game.archivedAt !== null).length;

  if (state.games.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <main className="flex flex-col items-center gap-4 text-center">
          <h1 className="text-3xl font-semibold tracking-tight">Flip 7 Scorekeeper</h1>
          <p className="text-muted-foreground">No games yet — start your first one.</p>
          <Link href="/game/new">New game</Link>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Games</h1>
        <Link href="/game/new">New game</Link>
      </div>

      {actionError && <p className="text-status-busted text-sm">{actionError}</p>}

      {archivedCount > 0 && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(event) => setShowArchived(event.target.checked)}
          />
          Show archived ({archivedCount})
        </label>
      )}

      <ul className="flex flex-col gap-2">
        {sortGames(visibleGames).map((game) => {
          const label = game.players.map((player) => player.name).join(", ");
          return (
            <li
              key={game.id}
              className="flex items-center justify-between gap-4 rounded border border-border p-3"
            >
              <div className="flex flex-col gap-1">
                <span>
                  {label}
                  {game.archivedAt !== null && (
                    <span className="text-muted-foreground"> · Archived</span>
                  )}
                </span>
                <span className="text-muted-foreground text-sm">
                  Round {game.roundNumber}
                  {game.leader && ` · Leading: ${game.leader.name} (${game.leader.score})`}
                  {" · "}
                  {new Date(game.lastPlayedAt).toLocaleString()}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Link href={`/game/${game.id}`}>{game.status === "active" ? "Resume" : "View"}</Link>
                {game.archivedAt === null ? (
                  <button type="button" onClick={() => archiveGame(game.id)}>
                    Archive
                  </button>
                ) : (
                  <button type="button" onClick={() => unarchiveGame(game.id)}>
                    Unarchive
                  </button>
                )}
                <button type="button" onClick={() => deleteGame(game.id, label)}>
                  Delete
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
