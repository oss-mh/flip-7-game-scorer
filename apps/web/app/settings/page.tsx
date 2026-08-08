"use client";

import { useEffect, useState } from "react";

import { useGameRepository } from "@/lib/gameRepositoryContext";
import {
  getSessionInfoAction,
  sendMagicLinkAction,
  signOutAction,
} from "@/lib/serverActions/authActions";
import { usePreference } from "@/lib/usePreference";

import type { SessionInfo } from "@/lib/serverActions/authActions";

function toErrorMessage(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}

/**
 * Account section only renders anything when the http adapter is
 * configured — `NEXT_PUBLIC_STORAGE_ADAPTER` is inlined at build time, so
 * this is a plain client-side check, not a network round trip. Signing in
 * is meaningless for the default local-only setup, and showing it anyway
 * would be exactly the kind of clutter AGENTS.md's "readability at arm's
 * length" priority warns against.
 */
function AccountSection() {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    // Guarded here, not just by the early `return null` below: that check
    // happens after this effect runs, and the Server Action itself throws
    // when the http adapter isn't configured (see
    // supabaseServerClient.ts — a deliberate configuration error, not
    // meant to be reachable from the default local-storage setup at all).
    if (process.env.NEXT_PUBLIC_STORAGE_ADAPTER !== "http") return;
    getSessionInfoAction()
      .then(setSession)
      .catch(() => setSession({ signedIn: false, email: null }));
  }, []);

  async function handleSendLink() {
    setSending(true);
    setMessage(null);
    try {
      const result = await sendMagicLinkAction(email);
      setMessage(result.message);
    } catch (err) {
      setMessage(toErrorMessage(err));
    } finally {
      setSending(false);
    }
  }

  if (process.env.NEXT_PUBLIC_STORAGE_ADAPTER !== "http" || session === null) {
    return null;
  }

  return (
    <section className="flex w-full max-w-md flex-col gap-3 rounded border border-border p-4">
      <div>
        <h2 className="font-semibold">Account</h2>
        <p className="text-muted-foreground text-sm">
          Signing in lets you reach your games from another device and share a game by code. Playing
          without signing in works the same as always — nothing here is required.
        </p>
      </div>

      {session.signedIn ? (
        <>
          <p className="text-sm">
            Signed in as <span className="font-medium">{session.email}</span>
          </p>
          <button type="button" onClick={() => void signOutAction()}>
            Sign out
          </button>
        </>
      ) : (
        <>
          <label className="flex flex-col gap-1 text-sm">
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
            />
          </label>
          <button type="button" disabled={sending} onClick={() => void handleSendLink()}>
            {sending ? "Sending…" : "Send sign-in link"}
          </button>
        </>
      )}
      {message && <p className="text-muted-foreground text-sm">{message}</p>}
    </section>
  );
}

export default function SettingsPage() {
  const repository = useGameRepository();
  const [wakeLockEnabled, setWakeLockEnabled] = usePreference("wakeLockEnabled", true);
  const [hapticsEnabled, setHapticsEnabled] = usePreference("hapticsEnabled", true);
  const [soundEnabled, setSoundEnabled] = usePreference("soundEnabled", false);
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

      <AccountSection />

      <section className="flex w-full max-w-md flex-col gap-2 rounded border border-border p-4">
        <h2 className="font-semibold">Keep screen awake</h2>
        <p className="text-muted-foreground text-sm">
          Stops the screen from dimming or locking while a round is in progress. Releases
          automatically between rounds and when you leave the game.
        </p>
        <label className="min-h-touch flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={wakeLockEnabled}
            onChange={(event) => setWakeLockEnabled(event.target.checked)}
          />
          Keep screen awake during a round
        </label>
      </section>

      <section className="flex w-full max-w-md flex-col gap-3 rounded border border-border p-4">
        <div>
          <h2 className="font-semibold">Sound &amp; haptics</h2>
          <p className="text-muted-foreground text-sm">
            Distinct feedback for a card dealt, a bust, a freeze and a Flip 7. Vibration is skipped
            automatically if your device has reduced motion turned on; sound already respects silent
            mode.
          </p>
        </div>
        <label className="min-h-touch flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={hapticsEnabled}
            onChange={(event) => setHapticsEnabled(event.target.checked)}
          />
          Haptics
        </label>
        <label className="min-h-touch flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={soundEnabled}
            onChange={(event) => setSoundEnabled(event.target.checked)}
          />
          Sound
        </label>
      </section>

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
