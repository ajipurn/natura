/// <reference types="bun" />
/**
 * Susun hasil build untuk Vercel (Build Output API v3) di .vercel/output, dijalankan oleh
 * `bun run build` setelah `vite build`:
 *   static/              → file app hasil Vite (dist/)
 *   functions/api.func/  → API Hono (src/server/vercel.ts) dibundel jadi satu file
 *   config.json          → routes: /api/* ke function, alamat app (SPA) ke index.html-nya
 *
 * Vercel memakai folder ini apa adanya. Region function mengikuti region database (lihat
 * `functionRegion`), atau FUNCTION_REGION kalau diisi.
 */
import { cpSync, existsSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { functionRegion } from "./vercel-region";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, ".vercel/output");
const FUNC = path.join(OUT, "functions/api.func");
const { region, reason } = functionRegion({ FUNCTION_REGION: process.env.FUNCTION_REGION, DATABASE_URL: process.env.DATABASE_URL });

if (!existsSync(path.join(ROOT, "dist/index.html"))) {
  console.error("✗ dist/ belum ada. Jalankan `vite build` dulu (atau `bun run build`).");
  process.exit(1);
}

rmSync(OUT, { recursive: true, force: true });
cpSync(path.join(ROOT, "dist"), path.join(OUT, "static"), { recursive: true });

const result = await Bun.build({
  entrypoints: [path.join(ROOT, "src/server/vercel.ts")],
  outdir: FUNC,
  naming: "index.mjs",
  target: "node",
  format: "esm",
  sourcemap: "linked",
});
if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

const json = (file: string, value: unknown) => writeFileSync(file, JSON.stringify(value, null, 2) + "\n");

json(path.join(FUNC, ".vc-config.json"), {
  runtime: "nodejs22.x",
  handler: "index.mjs",
  launcherType: "Nodejs",
  shouldAddHelpers: false,
  shouldAddSourcemapSupport: true,
  regions: [region],
});

json(path.join(OUT, "config.json"), {
  version: 3,
  routes: [
    // Nama file hasil Vite unik per versi, aman disimpan lama di browser.
    { src: "^/assets/.*$", headers: { "cache-control": "public, max-age=31536000, immutable" }, continue: true },
    { src: "^/api(?:/.*)?$", dest: "/api" },
    { handle: "filesystem" },
    // Sama dengan appShell() di vite.config.ts. Alamat berbentuk file yang tidak ada tetap 404.
    { src: "^/petugas(?:/.*)?$", dest: "/petugas/index.html" },
    { src: "^/admin(?:/.*)?$", dest: "/admin/index.html" },
    { src: "^/(?!.*\\.[a-zA-Z0-9]+$).*$", dest: "/index.html" },
  ],
});

console.log(`✓ .vercel/output siap (function di ${region}: ${reason}).`);
