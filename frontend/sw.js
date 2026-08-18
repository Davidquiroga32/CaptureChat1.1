const CACHE_NAME = "capturechat-v1";
const STATIC_ASSETS = [
    "/",
    "/index.html",
    "/register.html",
    "/dashboard.html",
    "/manifest.json",
    "/css/styles.css",
    "/css/login.css",
    "/css/register.css",
    "/css/dashboard.css",
    "/css/responsive.css",
    "/css/keyword-tags.css",
    "/js/login.js",
    "/js/register.js",
    "/js/dashboard.js",
    "/icons/icon-192.png",
    "/icons/icon-512.png",
    "/icons/icon-180.png",
    "/icons/icon-maskable-512.png"
];

self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(STATIC_ASSETS))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener("fetch", (event) => {
    const { request } = event;
    if (request.method !== "GET") return;

    const url = new URL(request.url);

    // La API siempre va a la red (datos en vivo + autenticación)
    if (url.pathname.startsWith("/api/")) return;

    // Navegación: red primero, caché como respaldo (offline)
    if (request.mode === "navigate") {
        event.respondWith(
            fetch(request)
                .then((res) => {
                    const copy = res.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
                    return res;
                })
                .catch(() => caches.match(request).then((r) => r || caches.match("/index.html")))
        );
        return;
    }

    // Estáticos: caché primero
    event.respondWith(
        caches.match(request).then((cached) => cached || fetch(request))
    );
});
