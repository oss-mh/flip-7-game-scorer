"use server";

import { createGameSharingActions } from "@flip-7/adapters";

import { createSupabaseServerClient } from "@/lib/supabaseServerClient";

import type { ActionResult } from "@flip-7/adapters";
import type { GameId } from "@flip-7/engine";

/** Thin "use server" wrapper — see gameActions.ts's doc comment for why the real logic lives in @flip-7/adapters instead. */
export async function getJoinCodeAction(gameId: GameId): Promise<ActionResult<string>> {
  const client = await createSupabaseServerClient();
  return createGameSharingActions(client).getJoinCode(gameId);
}

export async function redeemJoinCodeAction(code: string): Promise<ActionResult<GameId>> {
  const client = await createSupabaseServerClient();
  return createGameSharingActions(client).redeemJoinCode(code);
}
