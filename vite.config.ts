import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { fileURLToPath, pathToFileURL } from "node:url";
import { defineConfig, loadEnv, type Connect, type Plugin, type ViteDevServer } from "vite";
import { DEV_SEED_PATH, DEV_TOKEN_HEADER, removeDevServerInfo, writeDevServerInfo } from "./scripts/dev-server-info";
import { domainRedirect, pageShell } from "./scripts/app-routing";
import { NATURA_HOSTS } from "./src/lib/app-paths";

const src = fileURLToPath(new URL("./src", import.meta.url));
/** Function API hasil `bun run build` (lihat scripts/build-vercel.ts). */
const builtApi = fileURLToPath(new URL("./.vercel/output/functions/api.func/index.mjs", import.meta.url));

type Handler = (req: IncomingMessage, res: ServerResponse) => Promise<unknown>;

/**
 * Halaman HTML tiap app (SPA), berdasarkan subdomain atau path development.
 * Sama dengan aturan routes di scripts/app-routing.ts.
 */
function appShell(): Connect.NextHandleFunction {
  return (req, res, next) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const isPage = (req.method === "GET" || req.method === "HEAD") && req.headers.accept?.includes("text/html");
    if (isPage) {
      const redirect = domainRedirect(url);
      if (redirect) {
        res.writeHead(308, { Location: redirect });
        return res.end();
      }
      const shell = pageShell(url.pathname, url.hostname);
      if (shell) req.url = `${shell}${url.search}`;
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

const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return chunks.length ? (JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>) : {};
}

/**
 * `bun run seed` saat server dev jalan: seed dijalankan di proses server ini, yang memegang
 * database lokalnya (lihat scripts/dev-server-info.ts). Hanya dari komputer ini, dengan token.
 */
function devSeed(server: ViteDevServer, vars: Record<string, string>): Connect.NextHandleFunction {
  const token = randomUUID();
  const root = server.config.root;
  server.httpServer?.on("listening", () => {
    const address = server.httpServer?.address();
    if (!address || typeof address === "string") return;
    const host = address.address === "::" || address.address === "0.0.0.0" ? "127.0.0.1" : address.address;
    writeDevServerInfo(root, { pid: process.pid, url: `http://${host.includes(":") ? `[${host}]` : host}:${address.port}`, token });
  });
  server.httpServer?.on("close", () => removeDevServerInfo(root, token));
  process.once("exit", () => removeDevServerInfo(root, token));

  return (req, res, next) => {
    if (req.url !== DEV_SEED_PATH) return next();
    const send = (status: number, body: unknown) => {
      res.statusCode = status;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(body));
    };
    if (req.method !== "POST" || req.headers[DEV_TOKEN_HEADER] !== token || !LOOPBACK.has(req.socket.remoteAddress ?? "")) {
      return send(403, { ok: false, lines: [], error: "Tidak diizinkan." });
    }
    const lines: string[] = [];
    void (async () => {
      try {
        const { replaceSchedule } = await readJson(req);
        const { devDb } = (await server.ssrLoadModule("/src/server/dev.ts")) as typeof import("./src/server/dev");
        const { seed } = (await server.ssrLoadModule("/scripts/seed-core.ts")) as typeof import("./scripts/seed-core");
        const local = await devDb(vars);
        await seed(local.db, { root, label: `${local.label}, lewat server dev`, remote: false, replaceSchedule: replaceSchedule === true, log: (line) => lines.push(line) });
        send(200, { ok: true, lines });
      } catch (err) {
        send(200, { ok: false, lines, error: err instanceof Error ? err.message : String(err) });
      }
    })();
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
      server.middlewares.use(devSeed(server, vars));
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
  server: { allowedHosts: NATURA_HOSTS },
  preview: { allowedHosts: NATURA_HOSTS },
  resolve: { alias: { "@": src } },
  // Penanda versi app untuk salinan cache di HP (src/client/query.ts); baru setiap build/server dev.
  define: { __BUILD_ID__: JSON.stringify(Date.now().toString(36)) },
  build: {
    // three.js (tampilan 3D) memang besar, tapi hanya dimuat saat tab 3D dibuka.
    chunkSizeWarningLimit: 650,
    rolldownOptions: {
      // Empat bagian dalam satu build; subdomain memilih HTML masing-masing.
      input: {
        warga: fileURLToPath(new URL("./index.html", import.meta.url)),
        petugas: fileURLToPath(new URL("./petugas/index.html", import.meta.url)),
        admin: fileURLToPath(new URL("./admin/index.html", import.meta.url)),
        landing: fileURLToPath(new URL("./landing/index.html", import.meta.url)),
      },
    },
  },
});
