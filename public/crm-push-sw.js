/* eslint-disable no-undef */
self.addEventListener("push", (event) => {
  let data = { title: "Liftygo CRM", body: "", url: "/", tag: "crm" };
  try {
    if (event.data) {
      const j = event.data.json();
      if (j && typeof j === "object") Object.assign(data, j);
    }
  } catch {
    /* ignore */
  }
  const url = typeof data.url === "string" && data.url.startsWith("/") ? data.url : "/";
  event.waitUntil(
    self.registration.showNotification(String(data.title || "CRM"), {
      body: String(data.body || ""),
      icon: "/favicon.ico",
      badge: "/favicon.ico",
      tag: String(data.tag || "crm"),
      renotify: true,
      requireInteraction: false,
      silent: false,
      vibrate: [180, 80, 180],
      data: { url },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const raw = event.notification.data && event.notification.data.url;
  const path = typeof raw === "string" && raw.startsWith("/") ? raw : "/";
  const target = self.location.origin + path;
  event.waitUntil(self.clients.openWindow ? self.clients.openWindow(target) : Promise.resolve());
});
