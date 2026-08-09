"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabaseServerClient";

/**
 * What the UI needs to know about the current session — never the full
 * Supabase `User` object, which carries more than a settings screen
 * should render. `isAnonymous` distinguishes proxy.ts's invisible
 * bootstrap session from an actual signed-in identity; the UI only ever
 * treats the latter as "signed in".
 */
export interface SessionInfo {
  readonly signedIn: boolean;
  readonly email: string | null;
}

export async function getSessionInfoAction(): Promise<SessionInfo> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.is_anonymous) {
    return { signedIn: false, email: null };
  }
  return { signedIn: true, email: user.email ?? null };
}

/**
 * Upgrades the current session (anonymous or none) to a real identity —
 * same `auth.uid()` if one already existed via proxy.ts's anonymous
 * bootstrap, per Supabase's anonymous-to-permanent linking behavior, so
 * every local game this device already synced stays associated with the
 * account rather than becoming orphaned. See docs/adr/0004 and #92's
 * "local games can be claimed and uploaded on first sign-in" — the actual
 * claiming is `OfflineQueueGameRepository`'s existing sync-on-construct
 * (#90), triggered for free by the page reload the callback redirect
 * causes; nothing new needed here for that part.
 */
export async function sendMagicLinkAction(
  email: string,
): Promise<{ readonly ok: boolean; readonly message: string }> {
  const trimmed = email.trim();
  if (!trimmed) {
    return { ok: false, message: "Enter an email address." };
  }

  const supabase = await createSupabaseServerClient();
  const headerList = await headers();
  const origin = headerList.get("origin") ?? `https://${headerList.get("host") ?? ""}`;

  const { error } = await supabase.auth.signInWithOtp({
    email: trimmed,
    options: { emailRedirectTo: `${origin}/auth/callback` },
  });

  if (error) {
    return { ok: false, message: error.message };
  }
  return { ok: true, message: "Check your email for a sign-in link." };
}

/**
 * Only ever clears the session cookie — see AGENTS.md, "Don't use
 * localStorage directly outside the adapter": this is a Server Action, it
 * has no access to the browser's localStorage at all, so #92's "signing
 * out never destroys local data" holds by construction, not by care taken
 * here. The next request re-establishes a fresh anonymous session via
 * proxy.ts, so remote sync degrades to "offline" rather than staying
 * permanently dead — the same graceful path #90 already built for an
 * unreachable network.
 */
export async function signOutAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/settings");
}
