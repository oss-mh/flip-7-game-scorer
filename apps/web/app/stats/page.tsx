"use client";

import { headToHead, lifetimePlayerStats, playerRoundScores } from "@flip-7/engine";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { HeadToHead } from "@/components/stats/HeadToHead";
import { Leaderboard } from "@/components/stats/Leaderboard";
import { PlayerDetail } from "@/components/stats/PlayerDetail";
import { useGameRepository } from "@/lib/gameRepositoryContext";

import type { GameEvent } from "@flip-7/engine";

type LoadState =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly error: Error }
  | { readonly status: "ready"; readonly gameLogs: readonly (readonly GameEvent[])[] };

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

/**
 * Loads every stored game's full event log — including archived ones; per
 * `GameMeta.archivedAt`'s own doc comment, an archived game "stays in
 * storage (still available for stats)" — and folds them through
 * `lifetimePlayerStats` for the leaderboard, `playerRoundScores` for a
 * selected player's distribution, and `headToHead` on demand. All three are
 * pure engine selectors; this page's only job is loading the raw logs and
 * rendering what they compute.
 */
export default function StatsPage() {
  const repository = useGameRepository();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);

  const refresh = useCallback(() => {
    repository
      .listGames()
      .then((metas) => Promise.all(metas.map((meta) => repository.loadEvents(meta.id))))
      .then((gameLogs) => setState({ status: "ready", gameLogs }))
      .catch((error: unknown) => setState({ status: "error", error: toError(error) }));
  }, [repository]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const stats = useMemo(
    () => (state.status === "ready" ? lifetimePlayerStats(state.gameLogs) : []),
    [state],
  );

  if (state.status === "loading") {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-muted-foreground">Loading stats…</p>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex flex-1 items-center justify-center">
        <main className="flex flex-col items-center gap-2 text-center">
          <p className="text-status-busted">{state.error.message}</p>
          <button type="button" onClick={refresh}>
            Retry
          </button>
        </main>
      </div>
    );
  }

  if (stats.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <main className="flex flex-col items-center gap-2 text-center">
          <h1 className="text-3xl font-semibold tracking-tight">Stats</h1>
          <p className="text-muted-foreground">No games yet — play one to start building stats.</p>
          <Link href="/game/new">New game</Link>
        </main>
      </div>
    );
  }

  if (stats.every((entry) => entry.roundsPlayed === 0)) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <main className="flex flex-col items-center gap-2 text-center">
          <h1 className="text-3xl font-semibold tracking-tight">Stats</h1>
          <p className="text-muted-foreground">
            No rounds have been closed yet — stats build up as games are played.
          </p>
        </main>
      </div>
    );
  }

  const selectedStats = stats.find((entry) => entry.name === selectedPlayer);

  return (
    <div className="flex flex-1 flex-col gap-6 p-3">
      <h1 className="text-xl font-semibold tracking-tight">Stats</h1>

      <section className="flex flex-col gap-2">
        <h2 className="text-muted-foreground text-xs tracking-wide uppercase">Leaderboard</h2>
        <Leaderboard stats={stats} onSelectPlayer={setSelectedPlayer} />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-muted-foreground text-xs tracking-wide uppercase">Head-to-head</h2>
        <HeadToHead players={stats} compute={(a, b) => headToHead(a, b, state.gameLogs)} />
      </section>

      {selectedStats && (
        <PlayerDetail
          stats={selectedStats}
          scores={playerRoundScores(selectedStats.name, state.gameLogs)}
          onClose={() => setSelectedPlayer(null)}
        />
      )}
    </div>
  );
}
