"use client";

import { DEFAULT_TARGET_SCORE, deckCountForPlayerCount } from "@flip-7/engine";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { createGame } from "@/lib/createGame";
import { useGameRepository } from "@/lib/gameRepositoryContext";
import { systemIdGenerator } from "@/lib/systemIdGenerator";

import type { Player } from "@flip-7/engine";

interface DraftPlayer {
  readonly id: string;
  readonly name: string;
}

function toErrorMessage(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}

export default function NewGamePage() {
  const router = useRouter();
  const repository = useGameRepository();

  const [players, setPlayers] = useState<readonly DraftPlayer[]>([]);
  const [nameInput, setNameInput] = useState("");
  const [dealerId, setDealerId] = useState<string | null>(null);
  const [targetScoreInput, setTargetScoreInput] = useState(String(DEFAULT_TARGET_SCORE));
  const [purist, setPurist] = useState(false);
  const [recentNames, setRecentNames] = useState<readonly string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    repository
      .listGames()
      .then((games) => {
        if (cancelled) return;
        const byRecency = [...games].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        const seen = new Set<string>();
        const names: string[] = [];
        for (const game of byRecency) {
          for (const player of game.players) {
            if (!seen.has(player.name)) {
              seen.add(player.name);
              names.push(player.name);
            }
          }
        }
        setRecentNames(names);
      })
      .catch(() => {
        // Quick-add suggestions are a convenience — a failure here must
        // never block setting up a new game.
      });

    return () => {
      cancelled = true;
    };
  }, [repository]);

  function addPlayer(name: string) {
    const trimmed = name.trim();
    if (trimmed.length === 0) return;
    setPlayers((previous) => [...previous, { id: systemIdGenerator.next(), name: trimmed }]);
    setNameInput("");
  }

  function renamePlayer(id: string, name: string) {
    setPlayers((previous) => previous.map((p) => (p.id === id ? { ...p, name } : p)));
  }

  function removePlayer(id: string) {
    setPlayers((previous) => previous.filter((p) => p.id !== id));
    setDealerId((previous) => (previous === id ? null : previous));
  }

  function movePlayer(id: string, direction: -1 | 1) {
    setPlayers((previous) => {
      const index = previous.findIndex((p) => p.id === id);
      const target = index + direction;
      if (index === -1 || target < 0 || target >= previous.length) return previous;
      const next = [...previous];
      const [item] = next.splice(index, 1);
      next.splice(target, 0, item);
      return next;
    });
  }

  const addedNames = new Set(players.map((p) => p.name));
  const suggestions = recentNames.filter((name) => !addedNames.has(name)).slice(0, 8);

  const hasEmptyName = players.some((p) => p.name.trim().length === 0);
  const hasEnoughPlayers = players.length >= 2;
  const targetScore = Number(targetScoreInput);
  const hasValidTargetScore = Number.isInteger(targetScore) && targetScore > 0;
  const deckCount = deckCountForPlayerCount(players.length);
  const isValid = hasEnoughPlayers && !hasEmptyName && hasValidTargetScore;

  async function handleSubmit() {
    if (!isValid) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      const finalPlayers: Player[] = players.map((p) => ({ id: p.id, name: p.name.trim() }));
      const firstDealerId = dealerId ?? finalPlayers[0].id;
      const gameId = await createGame(
        repository,
        finalPlayers,
        targetScore,
        firstDealerId,
        purist,
      );

      router.push(`/game/${gameId}`);
    } catch (error) {
      setSubmitError(toErrorMessage(error));
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center gap-6 p-4">
      <h1 className="text-3xl font-semibold tracking-tight">New game</h1>

      <form
        className="flex w-full max-w-md flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void handleSubmit();
        }}
      >
        <label className="flex flex-col gap-1">
          <span className="text-sm">Target score</span>
          <input
            className="rounded border border-border bg-surface px-3"
            style={{ minHeight: "var(--touch-target)" }}
            type="number"
            min={1}
            step={1}
            value={targetScoreInput}
            onChange={(event) => setTargetScoreInput(event.target.value)}
          />
        </label>

        <label className="min-h-touch flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={purist}
            onChange={(event) => setPurist(event.target.checked)}
          />
          <span>
            Purist mode
            <span className="text-muted-foreground block text-xs">
              Hides the card counter, bust risk and Flip 7 odds, and the picker never dims
              exhausted cards. Locked for the whole game once you start.
            </span>
          </span>
        </label>

        <div className="flex min-w-0 gap-2">
          <input
            className="min-w-0 flex-1 rounded border border-border bg-surface px-3"
            style={{ minHeight: "var(--touch-target)" }}
            placeholder="Player name"
            value={nameInput}
            onChange={(event) => setNameInput(event.target.value)}
          />
          <button type="button" className="shrink-0" onClick={() => addPlayer(nameInput)}>
            Add
          </button>
        </div>

        {suggestions.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {suggestions.map((name) => (
              <button key={name} type="button" onClick={() => addPlayer(name)}>
                + {name}
              </button>
            ))}
          </div>
        )}

        <ol className="flex flex-col gap-2">
          {players.map((player, index) => (
            <li key={player.id} className="flex flex-col gap-2 rounded border border-border p-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className="text-muted-foreground w-5 shrink-0 text-center text-sm">
                  {index + 1}
                </span>
                <input
                  className="min-w-0 flex-1 rounded border border-border bg-surface px-2"
                  style={{ minHeight: "var(--touch-target)" }}
                  value={player.name}
                  onChange={(event) => renamePlayer(player.id, event.target.value)}
                  aria-label={`Player ${index + 1} name`}
                />
                <button
                  type="button"
                  className="text-status-busted shrink-0"
                  onClick={() => removePlayer(player.id)}
                  aria-label={`Remove ${player.name || "player"}`}
                >
                  ✕
                </button>
              </div>
              <div className="flex min-w-0 items-center gap-2 pl-7">
                <button
                  type="button"
                  className="shrink-0"
                  onClick={() => movePlayer(player.id, -1)}
                  disabled={index === 0}
                  aria-label={`Move ${player.name || "player"} up`}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="shrink-0"
                  onClick={() => movePlayer(player.id, 1)}
                  disabled={index === players.length - 1}
                  aria-label={`Move ${player.name || "player"} down`}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate"
                  aria-pressed={dealerId === player.id}
                  onClick={() => setDealerId(player.id)}
                >
                  {dealerId === player.id ? "Dealing first" : "Deal first"}
                </button>
              </div>
            </li>
          ))}
        </ol>

        {players.length > 0 && (
          <p className="text-muted-foreground text-sm">
            Playing with {deckCount} deck{deckCount > 1 ? "s" : ""}
            {deckCount > 1 && " — recommended above 18 players"}
          </p>
        )}

        {hasEmptyName && (
          <p className="text-status-busted text-sm">Every player needs a name.</p>
        )}
        {!hasEnoughPlayers && (
          <p className="text-muted-foreground text-sm">Add at least 2 players to start.</p>
        )}
        {!hasValidTargetScore && (
          <p className="text-status-busted text-sm">Target score must be a positive whole number.</p>
        )}
        {submitError && <p className="text-status-busted text-sm">{submitError}</p>}

        <button type="submit" disabled={!isValid || submitting}>
          {submitting ? "Starting…" : "Start game"}
        </button>
      </form>
    </div>
  );
}
