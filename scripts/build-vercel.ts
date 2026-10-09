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
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DOMAIN_MANIFESTS, vercelRoutes } from "./app-routing";
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
  // Binding native opsional milik `pg`, tidak dipakai (dan tidak terpasang).
  external: ["pg-native"],
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
  routes: vercelRoutes,
});

for (const { source, target, name, shortName } of DOMAIN_MANIFESTS) {
  const manifest = JSON.parse(readFileSync(path.join(ROOT, "dist", source), "utf8"));
  const value = { ...manifest, name, short_name: shortName, id: "/", start_url: "/", scope: "/" };
  // Vite preview memakai dist, deployment memakai static.
  for (const dir of [path.join(ROOT, "dist"), path.join(OUT, "static")]) json(path.join(dir, target), value);
}

console.log(`✓ .vercel/output siap (function di ${region}: ${reason}).`);
