"use client";

import { useLongPress } from "@/lib/useLongPress";

import { CardTile } from "./CardTile";

import type { CardKind } from "./CardTile";

/**
 * One card in a lane, long-press-enabled for mistap correction (#74).
 * `useLongPress` is a hook, so this needs its own component per card
 * rather than being wired up inline inside a `.map()` in `PlayerLane`.
 */
export function DealtCardTile({
  kind,
  label,
  muted = false,
  onLongPress,
  disabled = false,
}: {
  readonly kind: CardKind;
  readonly label: string;
  readonly muted?: boolean;
  readonly onLongPress: () => void;
  readonly disabled?: boolean;
}) {
  const longPressHandlers = useLongPress(onLongPress, disabled);

  return (
    <div className="touch-none" {...longPressHandlers}>
      <CardTile kind={kind} label={label} muted={muted} />
    </div>
  );
}
