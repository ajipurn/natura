// Service worker Jimpitan: halaman Ronda tetap bisa dibuka walau sinyal hilang.
// Data catatan disimpan di HP (localStorage) oleh halaman Ronda dan dikirim saat online.

const CACHE = "jimpitan-v3";
const OFFLINE_PAGES = ["/ronda"];
const NETWORK_TIMEOUT_MS = 4000;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // File build Next.js dan gambar denah (?v=versi) punya URL unik per versi, aman disimpan selamanya.
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    (url.pathname === "/api/denah/gambar" && url.searchParams.has("v"))
  ) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      OFFLINE_PAGES.includes(url.pathname)
        ? networkFirst(request, url.pathname)
        : fetch(request).catch(() => offlineResponse()),
    );
  }
});

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function networkFirst(request, cacheKey) {
  const cache = await caches.open(CACHE);
  const network = fetch(request).then((response) => {
    // Redirect (mis. ke /login) tidak disimpan.
    if (response.ok && !response.redirected) cache.put(cacheKey, response.clone());
    return response;
  });
  network.catch(() => {}); // kegagalan ditangani di bawah
  const cached = await cache.match(cacheKey);

  if (!cached) {
    try {
      return await network;
    } catch {
      return offlineResponse();
    }
  }
  try {
    // Sinyal lemah di jalan: jangan menunggu terlalu lama sebelum pakai salinan.
    return await withTimeout(network, NETWORK_TIMEOUT_MS);
  } catch {
    return cached;
  }
}

function offlineResponse() {
  return new Response(
    "<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width'><title>Offline</title>" +
      "<body style='font-family:system-ui;padding:24px;line-height:1.5'><h1>Sedang offline</h1>" +
      "<p>Halaman ini butuh internet. Halaman Ronda tetap bisa dipakai offline kalau sudah pernah dibuka saat ada sinyal.</p>" +
      "<p><a href='/ronda'>Buka halaman Ronda</a></p></body>",
    { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}
