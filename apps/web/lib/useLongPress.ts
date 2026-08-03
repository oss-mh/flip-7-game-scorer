"use client";

import { useRef } from "react";

const LONG_PRESS_MS = 500;

/**
 * Long-press handlers for mistap correction (#74) — "we noticed three
 * cards ago", not the last action `undo` already covers. Pointer-based so
 * it works uniformly for touch and mouse, and cancels on move so a scroll
 * or a drag can never be mistaken for a hold.
 */
export function useLongPress(onLongPress: () => void, disabled = false) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clear(): void {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  function start(): void {
    if (disabled) return;
    clear();
    timerRef.current = setTimeout(onLongPress, LONG_PRESS_MS);
  }

  return {
    onPointerDown: start,
    onPointerUp: clear,
    onPointerLeave: clear,
    onPointerCancel: clear,
  };
}
