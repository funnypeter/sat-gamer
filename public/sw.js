/* Service worker for SAT Gamer web-push alerts. */

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    /* non-JSON payload — show a generic notification */
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "SAT Gamer", {
      body: data.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: data.url || "/parent-dashboard" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url =
    (event.notification.data && event.notification.data.url) ||
    "/parent-dashboard";
  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windows) => {
        for (const win of windows) {
          if ("focus" in win) {
            win.navigate(url).catch(() => {});
            return win.focus();
          }
        }
        return clients.openWindow(url);
      })
  );
});
