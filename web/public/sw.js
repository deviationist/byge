/**
 * byge service worker.
 *
 * Two jobs, and deliberately not a third:
 *
 *   1. Keep the app shell available offline, so an installed PWA opened on a
 *      train shows the last verdict instead of a browser error page.
 *   2. Never cache MET's data. Verdicts are cached in memory by React Query
 *      and persisted per location by the app itself, which knows how to label
 *      an answer as stale. A service worker handing back a silently-old radar
 *      response would produce a confident wrong answer with no age on it —
 *      exactly what this project exists to avoid.
 *
 * It does NOT do background sync or push. Those need a backend, and iOS does
 * not implement Periodic Background Sync for PWAs anyway.
 */

const VERSION = "byge-v1";
const SHELL = `${VERSION}-shell`;

// Precached at install so a cold offline open still boots.
const SHELL_URLS = ["/", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((c) => c.addAll(SHELL_URLS))
      // A failed precache must not block activation — the app still works
      // online, and the runtime cache will fill in.
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

/** MET's hosts. Their responses must always come from the network, never a cache. */
function isWeatherData(url) {
  return url.hostname === "thredds.met.no" || url.hostname === "api.met.no";
}

/** Build output is content-hashed, so it can be cached forever once seen. */
function isImmutableAsset(url) {
  return url.pathname.startsWith("/_expo/static/");
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Radar data: network only. If it fails, let it fail — the app decides what
  // to show and how old it is. Do not invent an answer here.
  if (isWeatherData(url)) return;

  // Navigations: try the network so a deploy lands promptly, fall back to the
  // cached shell so offline opens still work.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL).then((c) => c.put("/", copy));
          return res;
        })
        .catch(() => caches.match("/").then((r) => r ?? Response.error())),
    );
    return;
  }

  // Hashed assets: cache-first, since the filename changes when content does.
  if (isImmutableAsset(url) || url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((res) => {
            if (res.ok && res.type === "basic") {
              const copy = res.clone();
              caches.open(SHELL).then((c) => c.put(request, copy));
            }
            return res;
          }),
      ),
    );
  }
});
