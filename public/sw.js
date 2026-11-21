// Jednoduchý service worker pro PWA.
// Strategie: pro navigaci network-first (aby data byla čerstvá), s fallbackem
// na cache když je zařízení offline; statické assety cache-first.

const CACHE = "pos-v4";
const APP_SHELL = ["/", "/manifest.webmanifest", "/icon.svg", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)).catch(() => undefined),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // API požadavky vždy ze sítě (bez cache) – jde o data prodeje.
  if (url.pathname.startsWith("/api/")) return;
  // Data stránek Next.js (RSC) a administrace/osobní přehled vždy čerstvé ze sítě.
  if (url.searchParams.has("_rsc") || request.headers.get("RSC") === "1") return;
  if (url.pathname.startsWith("/admin") || url.pathname.startsWith("/muj") || url.pathname.startsWith("/prihlaseni")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => undefined);
          return res;
        })
        .catch(() => caches.match(request).then((r) => r ?? caches.match("/"))),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ??
        fetch(request).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => undefined);
          return res;
        }),
    ),
  );
});

// --- Push notifikace (úkoly) ---------------------------------------------------

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Nová zpráva", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Úkoly", {
      body: data.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: data.tag,
      renotify: Boolean(data.tag),
      data: { url: data.url || "/" },
    }),
  );
});

// Ťuknutí na notifikaci: otevřít (nebo přepnout na) stránku s úkolem.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", self.location.origin);
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        const u = new URL(client.url);
        if (u.origin === target.origin && u.pathname === target.pathname && "focus" in client) {
          client.navigate(target.href).catch(() => undefined);
          return client.focus();
        }
      }
      return self.clients.openWindow(target.href);
    }),
  );
});
