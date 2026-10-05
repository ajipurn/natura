import type { IncomingMessage, ServerResponse } from "node:http";
import { getRequestListener } from "@hono/node-server";
import { app } from "./app";
import { openLocalDb, type LocalDb } from "./db-local";

/**
 * API saat `bun run dev`, dipanggil plugin di vite.config.ts. Database dibuka sekali per proses
 * (disimpan di globalThis, karena modul ini dimuat ulang Vite setiap kali kodenya berubah).
 */
const store = globalThis as typeof globalThis & { __naturaDevDb?: Promise<LocalDb> };

export async function handleApi(req: IncomingMessage, res: ServerResponse, vars: Record<string, string>) {
  store.__naturaDevDb ??= openLocalDb(vars.DATABASE_URL || undefined).then(
    (local) => {
      console.log(`[api] database: ${local.label}`);
      return local;
    },
    (err) => {
      store.__naturaDevDb = undefined;
      throw err;
    },
  );
  const { db } = await store.__naturaDevDb;
  const listener = getRequestListener((request) => app.fetch(request, { db, AUTH_SECRET: vars.AUTH_SECRET, APP_URL: vars.APP_URL, DEV: "1" }), {
    overrideGlobalObjects: false,
  });
  await listener(req, res);
}
