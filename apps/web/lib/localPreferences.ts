/**
 * Small, incidental UI preferences (banner dismissals, toggles) — not game
 * data, so this is deliberately separate from the `GameRepository` port and
 * its `flip7:v1:*` keys. Never used for anything that participates in the
 * event log.
 */
const STORAGE_PREFIX = "flip7:pref:v1";

function getStorage(): Storage | null {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") return null;
  return window.localStorage;
}

export function getPreference<T>(key: string, fallback: T): T {
  const storage = getStorage();
  if (!storage) return fallback;

  const raw = storage.getItem(`${STORAGE_PREFIX}:${key}`);
  if (raw === null) return fallback;

  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function setPreference<T>(key: string, value: T): void {
  const storage = getStorage();
  if (!storage) return;

  try {
    storage.setItem(`${STORAGE_PREFIX}:${key}`, JSON.stringify(value));
  } catch {
    // Best-effort — a UI preference failing to persist (quota, private
    // browsing) isn't worth surfacing to the user.
  }
}
