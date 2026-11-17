/* Value Finder – Service Worker: immer zuerst das Netz, ohne Internet der letzte gespeicherte Stand. */
const C = "vf-v1";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", e => {
  const r = e.request;
  if (r.method !== "GET") return;
  const u = new URL(r.url);
  if (u.origin !== location.origin) return;
  const key = u.origin + u.pathname;
  e.respondWith(
    fetch(r).then(res => {
      if (res.ok) { const cp = res.clone(); caches.open(C).then(c => c.put(key, cp)); }
      return res;
    }).catch(() => caches.match(key).then(m => m || caches.match(u.origin + u.pathname.replace(/[^/]*$/, ""))))
  );
});
