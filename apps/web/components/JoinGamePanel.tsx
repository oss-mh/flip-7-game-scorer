"use client";

import { adoptRemoteGame } from "@flip-7/adapters";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useGameRepository } from "@/lib/gameRepositoryContext";
import { redeemJoinCodeAction } from "@/lib/serverActions/sharingActions";

function toErrorMessage(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}

/**
 * Redeeming grants this device's signed-in identity access to the game on
 * the server (#92's `redeem_join_code`); `adoptRemoteGame` (#90/#92,
 * `@flip-7/adapters`) is what actually pulls its meta and event log onto
 * this device so it shows up locally like any other game — see that
 * function's doc comment for why re-joining an already-known game is safe
 * to repeat.
 */
export function JoinGamePanel({ onClose }: { readonly onClose: () => void }) {
  const repository = useGameRepository();
  const router = useRouter();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleJoin() {
    setBusy(true);
    setError(null);
    try {
      const result = await redeemJoinCodeAction(code);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      await adoptRemoteGame(repository, result.value);
      router.push(`/game/${result.value}`);
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Join a game"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 sm:items-center"
    >
      <div className="border-border bg-surface flex w-full max-w-sm flex-col gap-3 rounded-lg border p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Join a game</h2>
          <button type="button" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <label className="flex flex-col gap-1 text-sm">
          Code
          <input
            type="text"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            className="text-center font-mono text-xl tracking-[0.3em] uppercase"
            maxLength={6}
            placeholder="ABC123"
          />
        </label>
        <button
          type="button"
          disabled={busy || code.trim().length === 0}
          onClick={() => void handleJoin()}
        >
          {busy ? "Joining…" : "Join"}
        </button>
        {error && <p className="text-status-busted text-sm">{error}</p>}
      </div>
    </div>
  );
}
