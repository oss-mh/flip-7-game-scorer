import type { ActionErrorCode, ActionResult } from "./httpGameRepository.js";
import type { SupabaseGameClient } from "./supabaseGameServerActions.js";
import type { GameId } from "@flip-7/engine";

/**
 * Sharing a game by join code (#92) — separate from `GameServerActions`
 * deliberately: redeeming or looking up a code isn't one of
 * `GameRepository`'s methods, it's how a second device gets *access* to a
 * game in the first place, so it doesn't belong on the same transport
 * interface `HttpGameRepository` wraps.
 */
export interface GameSharingActions {
  /** The current game's code, for the owner (or an existing participant) to share at the table. */
  getJoinCode(gameId: GameId): Promise<ActionResult<string>>;
  /** Redeems a code typed on another device, returning the game id it unlocked. */
  redeemJoinCode(code: string): Promise<ActionResult<GameId>>;
}

interface GameJoinCodeRow {
  readonly join_code: string;
}

function ok<T>(value: T): ActionResult<T> {
  return { ok: true, value };
}

function fail<T>(code: ActionErrorCode, message: string): ActionResult<T> {
  return { ok: false, code, message };
}

/**
 * See supabaseGameServerActions.ts's doc comment for why this takes an
 * already-authenticated client rather than building one, and why it's a
 * plain framework-free module living in packages/adapters.
 */
export function createGameSharingActions(supabase: SupabaseGameClient): GameSharingActions {
  return {
    async getJoinCode(gameId: GameId): Promise<ActionResult<string>> {
      const { data, error } = await supabase
        .from("games")
        .select("join_code")
        .eq("id", gameId)
        .maybeSingle();
      if (error) return fail("unavailable", error.message);
      if (!data) return fail("not_found", `Game "${gameId}" does not exist`);
      return ok((data as GameJoinCodeRow).join_code);
    },

    async redeemJoinCode(code: string): Promise<ActionResult<GameId>> {
      // Codes are generated uppercase (see supabaseGameServerActions.ts);
      // normalizing here means a device that typed it lowercase, or with
      // stray whitespace from a copy-paste, still works.
      const normalized = code.trim().toUpperCase();
      const { data, error } = await supabase.rpc("redeem_join_code", {
        p_code: normalized,
      });
      if (error) {
        return fail("not_found", "No game found for that code");
      }
      return ok(data as GameId);
    },
  };
}
