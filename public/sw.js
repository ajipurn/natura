// Service worker Jimpitan: app petugas tetap bisa dibuka walau sinyal hilang.
// Data catatan disimpan di HP (localStorage) oleh layar Ronda dan dikirim saat online.

const CACHE = "jimpitan-v7";
// Logo ikut disimpan untuk offline; naikkan versi CACHE saat aset bawaan diganti.
const BRAND_ASSETS = ["/natura-logo.svg", "/icon.svg", "/apple-icon.png"];
const APP_DOMAIN = self.location.hostname === "app.clusternatura.com";
/** Kerangka app petugas: / di subdomain, /petugas/ di alamat dev/preview lama. */
const SHELL = APP_DOMAIN ? "/" : "/petugas/";
const NETWORK_TIMEOUT_MS = 4000;

self.addEventListener("install", (event) => {
  event.waitUntil(precacheShell().catch(() => {}));
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

  // File hasil build Vite punya nama unik per versi, aman disimpan selamanya.
  if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/icons/") || BRAND_ASSETS.includes(url.pathname)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (request.mode === "navigate") {
    const inPetugas = APP_DOMAIN
      ? !/^\/(?:r|admin|dashboard|info|api)(?:\/|$)/.test(url.pathname) && !/\.[a-z0-9]+$/i.test(url.pathname)
      : url.pathname === "/petugas" || url.pathname.startsWith("/petugas/");
    event.respondWith(inPetugas ? networkFirstShell(request) : fetch(request).catch(() => offlineResponse()));
  }
});

/** Simpan kerangka app petugas beserta file JS/CSS yang dipakainya. */
async function precacheShell(response) {
  const cache = await caches.open(CACHE);
  const res = response ?? (await fetch(SHELL, { cache: "no-store" }));
  if (!res.ok || res.redirected) return;
  const html = await res.clone().text();
  await cache.put(SHELL, res);
  const assets = [...BRAND_ASSETS, ...[...html.matchAll(/(?:src|href)="(\/(?:assets\/|apple-icon\.png)[^"]*)"/g)].map((m) => m[1])];
  await Promise.all(
    assets.map(async (asset) => {
      if (!(await cache.match(asset))) await cache.add(asset);
    }),
  );
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function networkFirstShell(request) {
  const cache = await caches.open(CACHE);
  const network = fetch(request).then((response) => {
    // Versi baru app: perbarui salinan kerangka dan file-filenya di belakang layar.
    if (response.ok && !response.redirected) precacheShell(response.clone()).catch(() => {});
    return response;
  });
  network.catch(() => {}); // kegagalan ditangani di bawah
  const cached = await cache.match(SHELL);

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
      "<p>Halaman ini butuh internet. App petugas tetap bisa dipakai offline kalau sudah pernah dibuka saat ada sinyal.</p>" +
      `<p><a href='${SHELL}'>Buka app petugas</a></p></body>`,
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
