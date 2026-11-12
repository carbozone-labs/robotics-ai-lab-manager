/* Minimal service worker: makes the app installable and loads the shell fast.
   SAFETY: /api/* is never cached (it holds student/lab data), only the public app shell + hashed assets are. */
const VERSION = "rlb-v1";
const ROOT = self.registration.scope;
const SHELL = [ROOT, ROOT + "manifest.webmanifest", ROOT + "icons/icon-192.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return;   // network only
  if (req.mode === "navigate") {                         // pages: fresh from network, cached shell when offline
    e.respondWith(fetch(req).then((r) => { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(ROOT, copy)); return r; })
      .catch(() => caches.match(ROOT).then((r) => r || Response.error())));
    return;
  }
  if (url.pathname.includes("/assets/") || url.pathname.includes("/icons/")) {   // content-hashed files: cache first
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => {
      if (r.ok) { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
      return r;
    })));
  }
});
