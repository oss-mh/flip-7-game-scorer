import type { Card as CardType } from "@flip-7/engine";

export type CardKind = CardType["kind"];

/** Border/text accent per card kind — mirrors the `--card-*` tokens in globals.css. */
export const CARD_KIND_CLASSES: Record<CardKind, string> = {
  number: "border-card-number text-card-number",
  modifier: "border-card-modifier text-card-modifier",
  action: "border-card-action text-card-action",
};

const SIZE_CLASSES = {
  sm: "h-9 w-9 text-sm",
  md: "h-14 w-14 text-lg",
} as const;

export type CardTileSize = keyof typeof SIZE_CLASSES;

export function cardTileClassName(kind: CardKind, size: CardTileSize, muted: boolean): string {
  return [
    "flex shrink-0 items-center justify-center rounded-lg border-2 font-semibold select-none",
    CARD_KIND_CLASSES[kind],
    SIZE_CLASSES[size],
    muted ? "opacity-40" : "",
  ].join(" ");
}

/**
 * A single dealt card, rendered small enough that a full seven-card hand
 * still fits a lane at arm's length (#37) — deliberately not a `<button>`,
 * so it isn't forced to the 44px touch-target minimum every interactive
 * element gets. Long-press correction (#74) wraps this in its own handler.
 */
export function CardTile({
  kind,
  label,
  size = "sm",
  muted = false,
  className = "",
}: {
  readonly kind: CardKind;
  readonly label: string;
  readonly size?: CardTileSize;
  readonly muted?: boolean;
  readonly className?: string;
}) {
  return <div className={`${cardTileClassName(kind, size, muted)} ${className}`}>{label}</div>;
}
