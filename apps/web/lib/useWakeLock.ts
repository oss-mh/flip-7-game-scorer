"use client";

import { useEffect, useRef } from "react";

import { usePreference } from "./usePreference";

/**
 * Requests a screen wake lock while `roundInProgress` is true and the user
 * hasn't turned the setting off, releasing it the moment either flips, the
 * tab is backgrounded, or the caller unmounts (navigation away). The Wake
 * Lock API auto-releases on backgrounding, so the visibility listener below
 * only handles re-acquiring it once the tab is visible again. No-ops
 * entirely where the API isn't supported (Safari on iOS < 16.4, for
 * example) rather than erroring.
 */
export function useWakeLock(roundInProgress: boolean): void {
  const [enabled] = usePreference("wakeLockEnabled", true);
  const active = roundInProgress && enabled;
  const sentinelRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!active) return;
    if (!("wakeLock" in navigator)) return;

    let cancelled = false;

    async function acquire() {
      try {
        const sentinel = await navigator.wakeLock.request("screen");
        if (cancelled) {
          await sentinel.release();
          return;
        }
        sentinelRef.current = sentinel;
      } catch {
        // Permission denied, battery saver, unsupported, etc. — degrade silently.
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") void acquire();
    }

    void acquire();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      const sentinel = sentinelRef.current;
      sentinelRef.current = null;
      if (sentinel && !sentinel.released) void sentinel.release();
    };
  }, [active]);
}
