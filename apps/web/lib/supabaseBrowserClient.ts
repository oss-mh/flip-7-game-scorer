"use client";

import { createBrowserClient } from "@supabase/ssr";

import type { SupabaseGameClient } from "@flip-7/adapters";

/**
 * The browser-side counterpart to `supabaseServerClient.ts` — Realtime
 * (#91) is a persistent WebSocket connection, which only makes sense from
 * the client, unlike everything else in this app that goes through Server
 * Actions. Reads the same session `@supabase/ssr` already put in cookies
 * (see `proxy.ts`/`supabaseServerClient.ts`) — those cookies are
 * deliberately not `httpOnly`, the standard `@supabase/ssr` pattern for
 * letting both sides of one session work from the same cookie jar.
 *
 * Returns `null` rather than throwing when unconfigured: unlike a Server
 * Action (only ever called when the http adapter is deliberately
 * selected), this is called unconditionally from a hook that every round
 * page mounts, so "not configured" has to be a normal, silent case, not a
 * thrown configuration error.
 */
export function createSupabaseBrowserClient(): SupabaseGameClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return null;
  }
  return createBrowserClient(url, anonKey);
}
