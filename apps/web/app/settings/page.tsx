"use client";

import { useState } from "react";

import { useGameRepository } from "@/lib/gameRepositoryContext";

function toErrorMessage(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}

export default function SettingsPage() {
  const repository = useGameRepository();
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cleared, setCleared] = useState(false);

  async function handleClearAll() {
    const step1 = window.confirm(
      "Clear all games? This permanently deletes every game and cannot be undone.",
    );
    if (!step1) return;

    const step2 = window.confirm(
      "Are you absolutely sure? Type nothing, just confirm again — there is no way to recover the games after this.",
    );
    if (!step2) return;

    setClearing(true);
    setError(null);
    try {
      const games = await repository.listGames();
      for (const game of games) {
        await repository.deleteGame(game.id);
      }
      setCleared(true);
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setClearing(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center gap-6 p-4">
      <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>

      <section className="flex w-full max-w-md flex-col gap-2 rounded border border-border p-4">
        <h2 className="font-semibold">Clear all games</h2>
        <p className="text-muted-foreground text-sm">
          Permanently deletes every game on this device, including archived ones. This cannot be
          undone.
        </p>
        <button type="button" disabled={clearing} onClick={() => void handleClearAll()}>
          {clearing ? "Clearing…" : "Clear all games"}
        </button>
        {cleared && <p className="text-status-active text-sm">All games cleared.</p>}
        {error && <p className="text-status-busted text-sm">{error}</p>}
      </section>
    </div>
  );
}
