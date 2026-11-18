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

/* Mitteilungen (Web Push). Der Inhalt kommt Ende-zu-Ende verschlüsselt an – Apple/Google sehen ihn nicht. */
self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = { title: "Value Finder", body: e.data ? e.data.text() : "" }; }
  const titel = String(d.title || "Value Finder").slice(0, 120), text = String(d.body || "").slice(0, 400);
  e.waitUntil(self.registration.showNotification(titel, {
    body: text, icon: "icon-192.png", badge: "icon-192.png", tag: d.tag || undefined,
    data: { url: d.url || "" }
  }));
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const scope = self.registration.scope, u = String((e.notification.data || {}).url || "");
  const ziel = u.startsWith(scope) ? u : u.startsWith("#") ? scope + u : scope;   // nur eigene Seite öffnen
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(cs => {
    for (const c of cs) if (c.url.startsWith(scope)) { c.focus(); return c.navigate ? c.navigate(ziel) : null; }
    return self.clients.openWindow(ziel);
  }));
});
