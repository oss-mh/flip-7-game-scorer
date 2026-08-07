"use client";

import { useEffect, useState } from "react";

/**
 * Registers the offline service worker and, when a new one has finished
 * installing behind the one currently controlling the page, prompts the
 * user to reload rather than swapping assets out from under an in-progress
 * round. See public/sw.js — the waiting worker never activates itself.
 */
export function AppServiceWorker() {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    const container = navigator.serviceWorker;
    let registration: globalThis.ServiceWorkerRegistration | undefined;

    function trackInstalling(installing: ServiceWorker) {
      installing.addEventListener("statechange", () => {
        if (installing.state === "installed" && container.controller) {
          setWaitingWorker(installing);
        }
      });
    }

    function handleUpdateFound() {
      if (registration?.installing) trackInstalling(registration.installing);
    }

    container
      .register("/sw.js")
      .then((reg) => {
        registration = reg;
        if (reg.waiting && container.controller) setWaitingWorker(reg.waiting);
        reg.addEventListener("updatefound", handleUpdateFound);
      })
      .catch(() => {
        // Offline support is a progressive enhancement — if registration
        // fails the app still works, just without it for this session.
      });

    let reloaded = false;
    function handleControllerChange() {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    }
    container.addEventListener("controllerchange", handleControllerChange);

    return () => {
      registration?.removeEventListener("updatefound", handleUpdateFound);
      container.removeEventListener("controllerchange", handleControllerChange);
    };
  }, []);

  if (!waitingWorker) return null;

  return (
    <div className="border-border bg-surface flex items-center justify-between gap-4 border-b px-4 py-2 text-sm">
      <span>An update is ready.</span>
      <button type="button" onClick={() => waitingWorker.postMessage({ type: "SKIP_WAITING" })}>
        Reload to update
      </button>
    </div>
  );
}
