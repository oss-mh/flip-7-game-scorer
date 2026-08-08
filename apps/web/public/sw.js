// Hand-rolled service worker — no build plugin available for this project's
// bundler (Serwist currently requires webpack; this app builds with
// Turbopack), so precaching and runtime caching are done by hand here.
//
// Cache-storage only. Game data lives in localStorage via the storage
// adapter, which this file never touches, so a cache-version bump here can
// never destroy stored games.

const SHELL_CACHE_PREFIX = "flip7-shell-";
const ASSET_CACHE_NAME = "flip7-assets-static";

// Statically prerendered routes and generated icons — safe to fetch and
// cache by URL directly. Per-game routes (`/game/[id]`, ...) are dynamic and
// get added to the shell cache the first time they're actually visited.
const PRECACHE_URLS = [
  "/",
  "/game/new",
  "/settings",
  "/stats",
  "/offline",
  "/manifest.webmanifest",
  "/favicon.ico",
  "/apple-icon",
  "/icons/icon-192",
  "/icons/icon-512",
  "/icons/maskable-icon-192",
  "/icons/maskable-icon-512",
];

let cachedVersion = null;

async function getVersion() {
  if (cachedVersion) return cachedVersion;
  try {
    const response = await fetch("/sw-version.json", { cache: "no-store" });
    const data = response.ok ? await response.json() : null;
    cachedVersion = typeof data?.version === "string" ? data.version : "dev";
  } catch {
    cachedVersion = "dev";
  }
  return cachedVersion;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const version = await getVersion();
      const cache = await caches.open(SHELL_CACHE_PREFIX + version);
      await Promise.allSettled(
        PRECACHE_URLS.map(async (url) => {
          try {
            const response = await fetch(url, { cache: "no-store" });
            if (response.ok) await cache.put(url, response);
          } catch {
            // Offline (or route unreachable) during install — it'll be
            // cached the first time it's actually visited instead.
          }
        }),
      );
    })(),
  );
  // Deliberately no self.skipWaiting() here: a waiting worker sits idle
  // until the page prompts the user and they confirm, so assets never swap
  // out from under an in-progress round.
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const version = await getVersion();
      const currentShellCache = SHELL_CACHE_PREFIX + version;
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith(SHELL_CACHE_PREFIX) && name !== currentShellCache)
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/splash/") ||
    url.pathname === "/apple-icon" ||
    url.pathname === "/favicon.ico" ||
    url.pathname === "/manifest.webmanifest"
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === "/sw.js" || url.pathname === "/sw-version.json") return;

  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
  }
});

async function cacheFirst(request) {
  const cache = await caches.open(ASSET_CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    if (cached) return cached;
    throw error;
  }
}

async function networkFirstNavigation(request) {
  const version = await getVersion();
  const cache = await caches.open(SHELL_CACHE_PREFIX + version);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    const offline = await cache.match("/offline");
    if (offline) return offline;
    return Response.error();
  }
}
