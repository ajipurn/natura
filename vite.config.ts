import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { existsSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { fileURLToPath, pathToFileURL } from "node:url";
import { defineConfig, loadEnv, type Connect, type Plugin } from "vite";

const src = fileURLToPath(new URL("./src", import.meta.url));
/** Function API hasil `bun run build` (lihat scripts/build-vercel.ts). */
const builtApi = fileURLToPath(new URL("./.vercel/output/functions/api.func/index.mjs", import.meta.url));

type Handler = (req: IncomingMessage, res: ServerResponse) => Promise<unknown>;

/**
 * Halaman HTML tiap app (SPA): /petugas/* → petugas, /admin/* → admin, selebihnya warga (/).
 * Sama dengan aturan routes di scripts/build-vercel.ts.
 */
function appShell(): Connect.NextHandleFunction {
  return (req, _res, next) => {
    const [pathname, query] = (req.url ?? "/").split("?");
    const isPage = (req.method === "GET" || req.method === "HEAD") && req.headers.accept?.includes("text/html");
    // Alamat berbentuk file (pakai titik) dan alamat internal Vite (/@vite, /@fs, …) dibiarkan.
    if (isPage && !/\.[a-z0-9]+$/i.test(pathname) && !pathname.startsWith("/@")) {
      for (const app of ["/petugas", "/admin"]) {
        if (pathname === app || (pathname.startsWith(`${app}/`) && pathname !== `${app}/`)) {
          req.url = `${app}/${query ? `?${query}` : ""}`;
        }
      }
    }
    next();
  };
}

function api(handler: Handler): Connect.NextHandleFunction {
  return (req, res, next) => {
    if (!req.url?.startsWith("/api/")) return next();
    handler(req, res).catch(next);
  };
}

/**
 * API Hono di server Vite: `bun run dev` memuat src/server/dev.ts (PGlite lokal atau DATABASE_URL),
 * `vite preview` memakai function hasil build (butuh DATABASE_URL ke Postgres sungguhan).
 */
function apiServer(): Plugin {
  return {
    name: "natura-api",
    configureServer(server) {
      const vars = loadEnv(server.config.mode, server.config.root, "");
      server.middlewares.use(
        api(async (req, res) => {
          const { handleApi } = (await server.ssrLoadModule("/src/server/dev.ts")) as typeof import("./src/server/dev");
          await handleApi(req, res, vars);
        }),
      );
      server.middlewares.use(appShell());
    },
    configurePreviewServer(server) {
      Object.assign(process.env, loadEnv("production", server.config.root, ""));
      let handler: Promise<Handler> | undefined;
      server.middlewares.use(
        api(async (req, res) => {
          if (!existsSync(builtApi)) throw new Error("Jalankan `bun run build` dulu.");
          handler ??= import(pathToFileURL(builtApi).href).then((m: { default: Handler }) => m.default);
          await (await handler)(req, res);
        }),
      );
      server.middlewares.use(appShell());
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), apiServer()],
  resolve: { alias: { "@": src } },
  build: {
    // three.js (tampilan 3D) memang besar, tapi hanya dimuat saat tab 3D dibuka.
    chunkSizeWarningLimit: 650,
    rolldownOptions: {
      // Tiga app dalam satu build: warga (/), petugas (/petugas/), admin (/admin/).
      input: {
        warga: fileURLToPath(new URL("./index.html", import.meta.url)),
        petugas: fileURLToPath(new URL("./petugas/index.html", import.meta.url)),
        admin: fileURLToPath(new URL("./admin/index.html", import.meta.url)),
      },
    },
  },
});
