self.addEventListener("install", (event) => {
    console.log("[SW] Instalando service worker...");
    self.skipWaiting();
});

self.addEventListener("activate", (event) => {
    console.log("[SW] Activando service worker...");
});

self.addEventListener("fetch", (event) => {
  // Por ahora se deja todas las peticiones tal cual.
  // Más adelante se puede agregar caché para algo offline.
});
