import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";

import type { NextRequest } from "next/server";

/**
 * Ensures an anonymous Supabase session exists before any Server Action
 * reaches the "http" adapter (#88's `createSupabaseServerClient`, #92's
 * join-code RPCs) — every one of those needs `auth.uid()` to be non-null
 * for RLS to grant anything at all (see the M10 migrations). Established
 * here, invisibly, rather than by the sign-in UI itself: #92's acceptance
 * criteria is "magic link OR anonymous device identity", and the
 * anonymous half has to exist from a session's very first request for the
 * app to be usable with the http adapter before anyone has explicitly
 * signed in. Signing in with a magic link later upgrades this same
 * session rather than starting a new one — see `sendMagicLinkAction`.
 *
 * A no-op entirely for the default `local-storage` adapter, and if the
 * Supabase env vars aren't configured — see the module doc on
 * `apps/web/lib/supabaseServerClient.ts` for why that's a configuration
 * error inside a Server Action but a silent skip here: Proxy runs on every
 * request including ones that will never touch the network adapter, and
 * the Next.js guidance is to keep Proxy cheap and only as capable as it
 * needs to be — see node_modules/next/dist/docs's "Proxy" reference,
 * "recommended to be used as a last resort".
 */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  if (process.env.NEXT_PUBLIC_STORAGE_ADAPTER !== "http") {
    return NextResponse.next();
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        // Written to both the current request (so this same pass sees the
        // refreshed session) and a fresh response object (so the browser
        // does too) — the standard @supabase/ssr proxy/middleware dance.
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    await supabase.auth.signInAnonymously();
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|icons/|splash/|manifest\\.webmanifest|sw\\.js|sw-version\\.json).*)",
  ],
};
