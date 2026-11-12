// Service worker so para os avisos (Web Push): "De olho" e os da familia (o que cada um
// pos na lista, o que acabou, quem esta no mercado). Nao guarda cache de nada:
// o app continua carregando da rede como sempre.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (e) => {
  let d = {};
  try {
    d = e.data ? e.data.json() : {};
  } catch {
    d = { body: e.data ? e.data.text() : "" };
  }
  e.waitUntil(
    self.registration.showNotification(d.title || "Despensa", {
      body: d.body || "",
      icon: "/icone-cesta-192.png",
      badge: "/icone-badge.png",
      // Mesmo assunto substitui o aviso anterior (nao empilha 5 "pos na lista"), mas toca de novo.
      tag: d.tag || "de-olho",
      renotify: true,
      timestamp: Date.now(),
      vibrate: [80, 40, 80],
      data: { url: d.url || "/app/ofertas" },
    }),
  );
});

// Tocar no aviso abre a aba Ofertas (ou traz o app para a frente, se ja estiver aberto).
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || "/app/ofertas", self.location.origin).href;
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((abertas) => {
      for (const c of abertas) {
        if ("navigate" in c) return c.focus().then(() => c.navigate(url));
      }
      return self.clients.openWindow(url);
    }),
  );
});
