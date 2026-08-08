"use client";

import { useSyncExternalStore } from "react";

import { getPreference, setPreference } from "@/lib/localPreferences";

/** Not in lib.dom.d.ts yet — Chrome-only, experimental. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type Snapshot =
  | { readonly platform: null }
  | { readonly platform: "ios" }
  | { readonly platform: "installable"; readonly event: BeforeInstallPromptEvent };

const NOT_ELIGIBLE: Snapshot = { platform: null };

function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !("MSStream" in window);
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

let snapshot: Snapshot = NOT_ELIGIBLE;
let listeners: (() => void)[] = [];
let initialized = false;

function setSnapshot(next: Snapshot) {
  snapshot = next;
  for (const listener of listeners) listener();
}

function handleBeforeInstallPrompt(event: Event) {
  event.preventDefault();
  setSnapshot({ platform: "installable", event: event as BeforeInstallPromptEvent });
}

function handleAppInstalled() {
  setPreference("installPromptDismissed", true);
  setSnapshot(NOT_ELIGIBLE);
}

/**
 * Runs exactly once per page load, however many times React calls
 * `subscribe` (StrictMode double-invokes it in development) — otherwise a
 * second invocation would see the "visited before" flag this same call just
 * set and wrongly treat one real visit as two.
 */
function initializeOnce() {
  if (initialized) return;
  initialized = true;

  if (isStandalone()) return;

  const hasVisitedBefore = getPreference("hasVisitedBefore", false);
  setPreference("hasVisitedBefore", true);
  // Never on the very first visit ever — someone who has never used the app
  // before shouldn't be asked to install it before they know if they like it.
  if (!hasVisitedBefore) return;

  if (getPreference("installPromptDismissed", false)) return;

  if (isIOS()) {
    snapshot = { platform: "ios" };
    return;
  }

  window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
  window.addEventListener("appinstalled", handleAppInstalled);
}

function subscribe(onStoreChange: () => void): () => void {
  initializeOnce();
  listeners = [...listeners, onStoreChange];
  return () => {
    listeners = listeners.filter((listener) => listener !== onStoreChange);
  };
}

function getSnapshot(): Snapshot {
  return snapshot;
}

function getServerSnapshot(): Snapshot {
  return NOT_ELIGIBLE;
}

/**
 * A custom install banner rather than relying on the browser's own UI —
 * Chrome's default `beforeinstallprompt` mini-infobar is easy to miss, and
 * iOS has no install API at all, only manual "Add to Home Screen" steps.
 * Backed by `useSyncExternalStore` rather than state-in-an-effect so the
 * client-only detection (no `window` during server render) can't cause a
 * hydration mismatch: server and the pre-mount client render both see
 * `getServerSnapshot`'s "not eligible" result.
 */
export function InstallPrompt() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  function dismiss() {
    setPreference("installPromptDismissed", true);
    setSnapshot(NOT_ELIGIBLE);
  }

  async function install() {
    if (state.platform !== "installable") return;
    await state.event.prompt();
    await state.event.userChoice;
    // Either way the native prompt is spent for this browser — don't nag
    // again with our own banner regardless of what the user chose.
    setPreference("installPromptDismissed", true);
    setSnapshot(NOT_ELIGIBLE);
  }

  if (state.platform === null) return null;

  if (state.platform === "ios") {
    return (
      <div className="border-border bg-surface flex items-center justify-between gap-4 border-b px-4 py-2 text-sm">
        <span>
          Install Flip 7: tap <span aria-hidden="true">⎋</span> Share, then &quot;Add to Home
          Screen&quot; <span aria-hidden="true">➕</span>.
        </span>
        <button type="button" onClick={dismiss}>
          Got it
        </button>
      </div>
    );
  }

  return (
    <div className="border-border bg-surface flex items-center justify-between gap-4 border-b px-4 py-2 text-sm">
      <span>Install Flip 7 for quick, full-screen access.</span>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => void install()}>
          Install
        </button>
        <button type="button" onClick={dismiss}>
          Not now
        </button>
      </div>
    </div>
  );
}
