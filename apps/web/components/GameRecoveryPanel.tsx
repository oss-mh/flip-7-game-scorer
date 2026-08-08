"use client";

import { exportGame } from "@flip-7/adapters";
import { useState } from "react";

import { buildErrorReport, formatErrorReport } from "@/lib/errorContext";
import { useGameRepository } from "@/lib/gameRepositoryContext";
import { revertToLastGoodState } from "@/lib/recoverGame";

import type { GameState } from "@flip-7/engine";

function toErrorMessage(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}

function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

/**
 * The recovery UI behind AGENTS.md issue #86's acceptance criteria: reload,
 * revert to last good state, and export the raw log, plus enough error
 * context to report. Shared by every place a game can fail to load or
 * render — the `error`/`degraded` branches in the game/history/replay
 * pages, and `app/game/[id]/error.tsx` for an actual render crash — so the
 * three recovery actions and the copyable error report stay identical
 * regardless of how the failure surfaced.
 */
export function GameRecoveryPanel({
  error,
  gameId,
  degradedState,
  onReload,
}: {
  readonly error: Error;
  readonly gameId: string;
  /** A recovered-but-possibly-stale state to preview, when one's available (the "degraded" status). */
  readonly degradedState?: GameState;
  readonly onReload: () => void;
}) {
  const repository = useGameRepository();
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleExport() {
    setActionError(null);
    setBusy(true);
    try {
      const exported = await exportGame(repository, gameId);
      downloadJson(`flip7-${gameId}.json`, exported);
    } catch (err) {
      setActionError(toErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleRevert() {
    const confirmed = window.confirm(
      "This first saves a full backup of the game's event log to your downloads, then reverts " +
        "the game to its last valid point, discarding whatever came after that couldn't be replayed. " +
        "Continue?",
    );
    if (!confirmed) return;

    setActionError(null);
    setBusy(true);
    try {
      const exported = await exportGame(repository, gameId);
      downloadJson(`flip7-${gameId}-backup-before-revert.json`, exported);

      const { discardedCount } = await revertToLastGoodState(repository, gameId);
      window.alert(
        discardedCount > 0
          ? `Reverted — ${discardedCount} event${discardedCount === 1 ? "" : "s"} discarded. ` +
              "A full backup was saved to your downloads first."
          : "Nothing needed reverting — the log is already at its last valid point.",
      );
      onReload();
    } catch (err) {
      setActionError(toErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const report = formatErrorReport(buildErrorReport(error, gameId));

  async function handleCopyDetails() {
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable — the text is still visible and
      // selectable in the <details> block below.
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <main
        role="alert"
        className="border-status-busted bg-status-busted/10 flex w-full max-w-md flex-col gap-4 rounded-lg border-2 p-4"
      >
        <div className="text-center">
          <h1 className="text-lg font-semibold">Something went wrong</h1>
          <p className="text-status-busted text-sm">{error.message}</p>
        </div>

        {degradedState && (
          <div className="border-border rounded-lg border p-3">
            <p className="text-muted-foreground mb-2 text-xs">
              Recovered scores as of the last point that could be read back:
            </p>
            <ul className="flex flex-col gap-1 text-sm">
              {degradedState.players.map((player) => (
                <li key={player.id} className="flex items-center justify-between gap-2">
                  <span>{player.name}</span>
                  <span className="font-semibold tabular-nums">
                    {degradedState.cumulativeScores[player.id] ?? 0}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <button type="button" onClick={onReload} disabled={busy}>
            Reload
          </button>
          <button type="button" onClick={() => void handleRevert()} disabled={busy}>
            Revert to last good state
          </button>
          <button type="button" onClick={() => void handleExport()} disabled={busy}>
            Export log
          </button>
        </div>

        {actionError && <p className="text-status-busted text-center text-sm">{actionError}</p>}

        <details>
          <summary className="text-muted-foreground flex min-h-touch min-w-touch cursor-pointer items-center justify-center text-center text-xs underline">
            Technical details
          </summary>
          <pre className="border-border bg-background mt-2 max-h-40 overflow-auto rounded-md border p-2 text-[11px] whitespace-pre-wrap">
            {report}
          </pre>
          <button
            type="button"
            className="text-muted-foreground mt-2 w-full text-xs underline"
            onClick={() => void handleCopyDetails()}
          >
            {copied ? "Copied!" : "Copy details"}
          </button>
        </details>
      </main>
    </div>
  );
}
