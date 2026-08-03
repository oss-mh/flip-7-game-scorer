import type { Card, GameEvent, Player } from "@flip-7/engine";

function playerName(players: readonly Player[], playerId: string): string {
  return players.find((player) => player.id === playerId)?.name ?? playerId;
}

function cardLabel(card: Card): string {
  if (card.kind === "number") return String(card.value);
  if (card.kind === "modifier") return card.modifier === "x2" ? "x2" : `+${card.modifier}`;
  return card.action;
}

/** A short, human-readable summary of an event, for the undo/redo confirmation banner. */
export function describeEvent(event: GameEvent, players: readonly Player[]): string {
  switch (event.t) {
    case "GameCreated":
      return "Game created";
    case "RoundStarted":
      return `Round started, ${playerName(players, event.dealerId)} dealing`;
    case "CardDealt":
      return `Dealt ${cardLabel(event.card)} to ${playerName(players, event.playerId)}`;
    case "PlayerStayed":
      return `${playerName(players, event.playerId)} stayed`;
    case "ActionTargeted":
      return `${playerName(players, event.sourceId)} targeted ${playerName(players, event.targetId)} with ${cardLabel(event.card)}`;
    case "DeckReshuffled":
      return "Deck reshuffled";
    case "ManualScoreEntered":
      return `${playerName(players, event.playerId)} scored ${event.points} manually`;
    case "RoundClosed":
      return "Round closed";
    default: {
      const exhaustive: never = event;
      return `Unknown event: ${JSON.stringify(exhaustive)}`;
    }
  }
}
