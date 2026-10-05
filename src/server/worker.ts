import { app } from "./app";
import type { Bindings } from "./env";

/**
 * Halaman HTML tiap app (SPA). File statis yang ada dilayani langsung oleh Workers Static Assets;
 * Worker ini hanya dipanggil untuk /api/* dan alamat yang tidak punya file, mis. /petugas/riwayat.
 */
export function appShellFor(pathname: string): string {
  if (pathname === "/petugas" || pathname.startsWith("/petugas/")) return "/petugas/";
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return "/admin/";
  return "/";
}

export default {
  async fetch(request: Request, env: Bindings, ctx: unknown): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) return app.fetch(request, env, ctx as never);
    if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method Not Allowed", { status: 405 });
    // Alamat yang tidak berbentuk file (tanpa titik) diarahkan ke halaman app-nya; selebihnya memang tidak ada.
    if (/\.[a-z0-9]+$/i.test(url.pathname)) return new Response("Tidak ditemukan.", { status: 404 });
    const shell = await env.ASSETS.fetch(new Request(new URL(appShellFor(url.pathname), url), request));
    return new Response(shell.body, { status: 200, headers: shell.headers });
  },
};
