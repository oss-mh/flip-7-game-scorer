"use client";

import { useEffect, useRef } from "react";

import { faceLabel, faceOfCard } from "@/lib/cardCatalog";

import type { ActionCard, ActionType, Player, PlayerId, RoundState } from "@flip-7/engine";

/**
 * Mirrors `requireEligibleTarget` in `packages/engine/src/reducers/actionTargeted.ts`:
 * active, and — for a duplicate Second Chance — not already holding one.
 * Not exported by the engine (see the exploration notes on selectors.ts),
 * so it's reproduced here rather than duplicating the *rule itself*: this
 * is target *eligibility*, which the engine already enforces server-side
 * on dispatch — getting it wrong here only means an over- or under-eager
 * button, never a silently wrong outcome.
 */
function eligibleTargetIds(round: RoundState, card: ActionCard): readonly PlayerId[] {
  return Object.values(round.players)
    .filter(
      (playerRound) =>
        playerRound.status === "active" &&
        !(card.action === "secondChance" && playerRound.heldSecondChance !== null),
    )
    .map((playerRound) => playerRound.playerId);
}

const EXPLANATIONS: Record<ActionType, string> = {
  freeze: "Choose who banks their points right now and leaves the round.",
  secondChance: "No room to keep this one — choose who receives it instead.",
  flipThree: "",
};

function playerName(players: readonly Player[], playerId: PlayerId): string {
  return players.find((player) => player.id === playerId)?.name ?? playerId;
}

/**
 * Takes over the controls area whenever `nextResolution()` is an
 * awaiting-target item (#70) — a revealed Freeze, or a Second Chance with
 * nowhere to go on its holder's own lane. Deliberately has no dismiss
 * affordance of any kind: a pending resolution blocks every other move in
 * the engine too (see `legalActions`), so there's nothing safe to fall back
 * to if this were closed.
 */
export function ActionTargetPrompt({
  card,
  sourcePlayerId,
  round,
  players,
  onResolve,
  busy,
}: {
  readonly card: ActionCard;
  readonly sourcePlayerId: PlayerId;
  readonly round: RoundState;
  readonly players: readonly Player[];
  readonly onResolve: (targetId: PlayerId) => void;
  readonly busy: boolean;
}) {
  const targets = eligibleTargetIds(round, card);
  const autoResolvedForRef = useRef<string | null>(null);

  useEffect(() => {
    if (targets.length === 1 && autoResolvedForRef.current !== card.id) {
      autoResolvedForRef.current = card.id;
      const [only] = targets;
      if (only) onResolve(only);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- targets is derived fresh each render; card.id is the stable identity that actually matters here.
  }, [card.id, targets.length]);

  const label = faceLabel(faceOfCard(card));
  const source = playerName(players, sourcePlayerId);

  if (targets.length <= 1) {
    return (
      <div className="border-card-action bg-card-action/10 flex flex-col gap-1 rounded-lg border-2 p-3 text-center">
        <p className="text-sm">
          {source} revealed <strong className="text-card-action">{label}</strong> — resolving…
        </p>
      </div>
    );
  }

  return (
    <div
      role="alertdialog"
      aria-label={`Choose a target for ${label}`}
      className="border-card-action bg-card-action/10 flex flex-col gap-2 rounded-lg border-2 p-3"
    >
      <p className="text-sm">
        {source} revealed <strong className="text-card-action">{label}</strong>
      </p>
      <p className="text-muted-foreground text-xs">{EXPLANATIONS[card.action]}</p>
      <div className="flex flex-wrap gap-2">
        {targets.map((targetId) => (
          <button key={targetId} type="button" disabled={busy} onClick={() => onResolve(targetId)}>
            {playerName(players, targetId)}
          </button>
        ))}
      </div>
    </div>
  );
}
