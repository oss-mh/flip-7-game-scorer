"use client";

import { useEffect, useState } from "react";

import { getJoinCodeAction } from "@/lib/serverActions/sharingActions";

import type { GameId } from "@flip-7/engine";

type CodeState =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly message: string }
  | { readonly status: "ready"; readonly code: string };

/**
 * The join code for one game (#92) — enough for another device at the
 * table to type in and reach the same game. Only ever mounted when the
 * http adapter is configured (see the round page, which conditions on
 * `NEXT_PUBLIC_STORAGE_ADAPTER`), so no "sharing isn't available" state to
 * design for here.
 */
export function ShareGamePanel({
  gameId,
  onClose,
}: {
  readonly gameId: GameId;
  readonly onClose: () => void;
}) {
  const [state, setState] = useState<CodeState>({ status: "loading" });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getJoinCodeAction(gameId)
      .then((result) => {
        if (cancelled) return;
        setState(
          result.ok
            ? { status: "ready", code: result.value }
            : { status: "error", message: result.message },
        );
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState({
          status: "error",
          message: error instanceof Error ? error.message : String(error),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [gameId]);

  async function handleCopy(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable — the code is still visible and selectable.
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Share this game"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 sm:items-center"
    >
      <div className="border-border bg-surface flex w-full max-w-sm flex-col gap-3 rounded-lg border p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Share this game</h2>
          <button type="button" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {state.status === "loading" && <p className="text-muted-foreground text-sm">Loading…</p>}
        {state.status === "error" && <p className="text-status-busted text-sm">{state.message}</p>}
        {state.status === "ready" && (
          <>
            <p className="text-muted-foreground text-sm">
              Enter this code on another signed-in device to join this game.
            </p>
            <p className="text-center font-mono text-3xl font-semibold tracking-[0.3em]">
              {state.code}
            </p>
            <button type="button" onClick={() => void handleCopy(state.code)}>
              {copied ? "Copied!" : "Copy code"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
