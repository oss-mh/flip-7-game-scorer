import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabaseServerClient";

import type { NextRequest } from "next/server";

/**
 * Where a magic-link email points (`sendMagicLinkAction`'s
 * `emailRedirectTo`). Exchanging the code sets the real session cookie,
 * replacing whatever anonymous session proxy.ts had established — see
 * `sendMagicLinkAction`'s doc comment for why that's an upgrade, not a
 * fresh identity, when an anonymous session already existed.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const code = request.nextUrl.searchParams.get("code");

  if (code) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(new URL("/settings", request.url));
}
