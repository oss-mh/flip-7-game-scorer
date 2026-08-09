"use client";

import { notifyRemoteChange } from "@flip-7/adapters";
import { useEffect, useState } from "react";

import { useGameRepository } from "./gameRepositoryContext";
import { createSupabaseBrowserClient } from "./supabaseBrowserClient";

import type { GameId } from "@flip-7/engine";
import type { RealtimeChannel } from "@supabase/supabase-js";

/** How often the polling fallback re-checks remote when Realtime never reaches SUBSCRIBED. */
const POLL_INTERVAL_MS = 8_000;

export interface PresentDevice {
  readonly key: string;
  readonly label: string;
  readonly isYou: boolean;
}

interface PresencePayload {
  readonly label: string;
}

/**
 * Live multi-device sync for one shared game (#91). Two independent things
 * on one channel:
 *
 * - A `postgres_changes` subscription on `game_events` INSERTs feeds
 *   straight into `notifyRemoteChange`, which is just #90's existing
 *   sync engine ("go check remote now") — Realtime doesn't get its own
 *   parallel sync logic, it's only a faster trigger for the one that
 *   already exists.
 * - Realtime Presence tracks who else is connected to this game right
 *   now. This is #91's "per-device identity" — deliberately *who's here*,
 *   not *who recorded event N*: attributing individual events would need
 *   a schema change threading an author through every read path
 *   (`GameEvent` itself is a pure engine type with no room for
 *   adapter-only metadata, see AGENTS.md "packages/engine stays pure"),
 *   for a payoff a live "who's at the table right now" indicator mostly
 *   already covers for a scorekeeping app.
 *
 * No `window` there to fire an `online` event either way — falls back to
 * polling whenever the channel doesn't reach `SUBSCRIBED` (blocked
 * websockets, a network blip), satisfying #91's "degrades to polling
 * where websockets are unavailable" directly, rather than assuming a
 * failed subscribe means "never try again".
 */
export function useLiveGameSync(gameId: GameId): readonly PresentDevice[] {
  const repository = useGameRepository();
  const [present, setPresent] = useState<readonly PresentDevice[]>([]);

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_STORAGE_ADAPTER !== "http") return;
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;

    let cancelled = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let channel: RealtimeChannel | null = null;

    function startPolling(): void {
      if (pollTimer || cancelled) return;
      pollTimer = setInterval(() => notifyRemoteChange(repository, gameId), POLL_INTERVAL_MS);
    }

    function stopPolling(): void {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    }

    supabase.auth
      .getUser()
      .then(({ data: { user } }) => {
        if (cancelled) return;

        const presenceKey = user?.id ?? "anonymous";
        const myLabel = user && !user.is_anonymous ? (user.email ?? "Signed in") : "This device";

        const newChannel = supabase
          .channel(`game-${gameId}`, { config: { presence: { key: presenceKey } } })
          .on(
            "postgres_changes",
            { event: "INSERT", schema: "public", table: "game_events", filter: `game_id=eq.${gameId}` },
            () => notifyRemoteChange(repository, gameId),
          )
          .on("presence", { event: "sync" }, () => {
            const state = newChannel.presenceState<PresencePayload>();
            setPresent(
              Object.entries(state).map(([key, entries]) => ({
                key,
                label: entries[0]?.label ?? "Unknown device",
                isYou: key === presenceKey,
              })),
            );
          })
          .subscribe((status) => {
            if (cancelled) return;
            if (status === "SUBSCRIBED") {
              stopPolling();
              void newChannel.track({ label: myLabel } satisfies PresencePayload);
            } else if (
              status === "CHANNEL_ERROR" ||
              status === "TIMED_OUT" ||
              status === "CLOSED"
            ) {
              startPolling();
            }
          });

        channel = newChannel;
      })
      .catch(() => {
        if (!cancelled) startPolling();
      });

    return () => {
      cancelled = true;
      stopPolling();
      if (channel) void supabase.removeChannel(channel);
    };
  }, [repository, gameId]);

  return present;
}
