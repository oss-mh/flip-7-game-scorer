import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import type { SupabaseGameClient } from "@flip-7/adapters";

/**
 * A fresh, request-scoped Supabase client for the current Server Action's
 * caller — never shared across requests, per `@supabase/ssr`'s own
 * guidance. Cookie-based, not a bearer token passed as an argument: Server
 * Action parameters are visible to anyone who can send the same POST (see
 * the Next.js Server Actions security guidance, "treat every action as an
 * untrusted entry point"), so the session has to come from the request's
 * own cookies, the same way a real browser session would carry it.
 *
 * Requires `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
 * — unset in every environment until a real Supabase project exists (see
 * docs/adr/0004). Selecting `NEXT_PUBLIC_STORAGE_ADAPTER=http` without
 * them is a configuration error, not a silent fallback.
 */
export async function createSupabaseServerClient(): Promise<SupabaseGameClient> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set to use the http storage adapter",
    );
  }

  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called somewhere other than a Server Action/Route Handler
          // (e.g. a Server Component render) where cookies can't be
          // written — harmless as long as session refreshes are also
          // handled somewhere that can, per the Supabase SSR guidance this
          // mirrors. Every caller here is a Server Action, but this stays
          // defensive rather than assuming that never changes.
        }
      },
    },
  });
}
