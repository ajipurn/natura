/**
 * Muat ulang favicon tab ini (mis. setelah logo diganti), tanpa menunggu halaman dibuka ulang.
 * Alamatnya `/api/logo/favicon` (lihat src/server/routes/logo.ts); `?t=` supaya browser tidak memakai
 * salinan lama.
 */
export function refreshFavicon() {
  const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (link) link.href = `/api/logo/favicon?t=${Date.now()}`;
}
