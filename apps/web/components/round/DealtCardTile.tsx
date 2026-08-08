"use client";

import { useLongPress } from "@/lib/useLongPress";

import { CardTile } from "./CardTile";

import type { CardKind } from "./CardTile";

/**
 * One card in a lane, long-press-enabled for mistap correction (#74).
 * `useLongPress` is a hook, so this needs its own component per card
 * rather than being wired up inline inside a `.map()` in `PlayerLane`.
 *
 * Pointer/touch users trigger the dialog with a hold, so an ordinary tap
 * while scanning the lane can never open it by mistake. Keyboard has no
 * "hold" gesture, so Enter/Space activates immediately instead — a native
 * `<button>`'s click fires for both a real pointer click and a keyboard
 * activation, and only the keyboard one has `event.detail === 0`, which is
 * what tells the two apart here. Using a real `<button>` (rather than a
 * `<div>` with a click handler bolted on) also gets keyboard focusability
 * and the 44px touch-target minimum for free from the global `button`
 * rule in globals.css, instead of having to hand-roll both.
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

  if (disabled) {
    return <CardTile kind={kind} label={label} muted={muted} />;
  }

  return (
    <button
      type="button"
      className="flex touch-none items-center justify-center"
      aria-label={`Correct dealt ${label} card`}
      onClick={(event) => {
        if (event.detail === 0) onLongPress();
      }}
      {...longPressHandlers}
    >
      <CardTile kind={kind} label={label} muted={muted} />
    </button>
  );
}
