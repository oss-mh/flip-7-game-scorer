"use client";

import { useCallback, useSyncExternalStore } from "react";

import { getPreference, setPreference } from "./localPreferences";

type Listener = () => void;

const listenersByKey = new Map<string, Set<Listener>>();

function subscribeToKey(key: string, listener: Listener): () => void {
  let listeners = listenersByKey.get(key);
  if (!listeners) {
    listeners = new Set();
    listenersByKey.set(key, listeners);
  }
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notifyKey(key: string): void {
  for (const listener of listenersByKey.get(key) ?? []) listener();
}

/**
 * A `useState`-shaped view over a `localPreferences` value: safe to read
 * during server rendering (returns `fallback`, matching the pre-mount
 * client render, so there's no hydration mismatch) and reactive across
 * every component reading the same key. Built on `useSyncExternalStore`
 * rather than state-in-an-effect for the same reason as `InstallPrompt`.
 */
export function usePreference<T>(key: string, fallback: T): readonly [T, (value: T) => void] {
  const value = useSyncExternalStore(
    (listener) => subscribeToKey(key, listener),
    () => getPreference(key, fallback),
    () => fallback,
  );

  const setValue = useCallback(
    (next: T) => {
      setPreference(key, next);
      notifyKey(key);
    },
    [key],
  );

  return [value, setValue] as const;
}
