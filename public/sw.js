/*
 * The app's service worker (registered by components/pwa.tsx).
 *
 *  - Push notifications: shows them, and opens the right page when tapped.
 *  - Offline: when a page can't load at all, shows /offline.html instead of the
 *    browser's error. Nothing else is cached: team data is always fresh and
 *    never stored on the device.
 *
 * Bump VERSION when this file changes so phones pick up the new one.
 */
const VERSION = "2026-10-04.2";
const OFFLINE_CACHE = `offline-${VERSION}`;
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(OFFLINE_CACHE)
      .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: "reload" })))
      .catch(() => {})
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("offline-") && k !== OFFLINE_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Only full page loads, only when the network fails completely.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || req.mode !== "navigate") return;
  event.respondWith(
    fetch(req).catch(() => caches.open(OFFLINE_CACHE).then((cache) => cache.match(OFFLINE_URL)).then((res) => res || Response.error()))
  );
});

// ---- Push notifications ---------------------------------------------------

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "New notification";
  const options = {
    body: data.body || "",
    icon: "/app-icons/icon-192.png",
    badge: "/app-icons/badge-96.png",
    tag: data.tag || undefined,
    renotify: !!data.tag,
    data: { url: typeof data.url === "string" && data.url.startsWith("/") ? data.url : "/dashboard" },
    timestamp: data.at ? Date.parse(data.at) || Date.now() : Date.now(),
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Tapping a notification: use an open window of the app if there is one.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/dashboard", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (new URL(w.url).origin === self.location.origin && "focus" in w) {
          return w.focus().then((f) => (f && "navigate" in f ? f.navigate(url) : f));
        }
      }
      return self.clients.openWindow(url);
    })
  );
});

// The browser replaced the subscription (keys rotated, expired): tell the server.
self.addEventListener("pushsubscriptionchange", (event) => {
  const old = event.oldSubscription;
  const key = old && old.options ? old.options.applicationServerKey : null;
  event.waitUntil(
    (event.newSubscription ? Promise.resolve(event.newSubscription) : key ? self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }) : Promise.resolve(null))
      .then((sub) =>
        sub
          ? fetch("/api/push/subscribe", {
              method: "POST",
              credentials: "same-origin",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ subscription: sub.toJSON(), replaces: old ? old.endpoint : null }),
            })
          : null
      )
      .catch(() => {})
  );
});
