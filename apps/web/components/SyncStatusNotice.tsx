"use client";

import { downloadJson } from "@/lib/downloadJson";
import { useSyncStatus } from "@/lib/useSyncStatus";

import type { GameId } from "@flip-7/engine";

/**
 * Nothing shown for the common case (a local-only game, or a synced
 * remote one) — see AGENTS.md design priorities, "Speed at the table" and
 * "Readability at arm's length": a status line that's visible every round
 * is exactly the kind of clutter those priorities warn against. Only
 * offline/syncing/just-resolved states earn a line here, and only "just
 * resolved a conflict" is dismissible/actionable rather than purely
 * informational — see docs/adr/0005 for the resolution this reports.
 */
export function SyncStatusNotice({ gameId }: { readonly gameId: GameId }) {
  const status = useSyncStatus(gameId);

  if (status.state === "synced") {
    return null;
  }

  if (status.state === "syncing") {
    return (
      <p role="status" className="text-muted-foreground px-3 pt-2 text-sm">
        Syncing to the cloud…
      </p>
    );
  }

  if (status.state === "offline") {
    const count = status.pendingCount;
    return (
      <p role="status" className="text-status-frozen px-3 pt-2 text-sm">
        Offline — {count} change{count === 1 ? "" : "s"} will sync once you&apos;re back online.
      </p>
    );
  }

  // "conflict-resolved"
  const resolution = status.resolution;
  if (!resolution) {
    return null;
  }

  const { winner, discardedCount, backup } = resolution;

  return (
    <div role="status" className="border-status-frozen/60 mx-3 mt-2 rounded-lg border p-2 text-sm">
      <p>
        {winner === "local"
          ? `Synced — this device's version was kept. ${discardedCount} conflicting cloud event${discardedCount === 1 ? " was" : "s were"} replaced.`
          : `Synced — a newer cloud version was kept. ${discardedCount} change${discardedCount === 1 ? "" : "s"} made on this device while offline couldn't be saved.`}
      </p>
      {backup && (
        <button
          type="button"
          className="mt-1 text-xs underline"
          onClick={() => downloadJson(`flip7-${gameId}-conflict-backup.json`, backup)}
        >
          Download what was discarded
        </button>
      )}
    </div>
  );
}
