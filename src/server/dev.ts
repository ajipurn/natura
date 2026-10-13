import type { IncomingMessage, ServerResponse } from "node:http";
import { getRequestListener } from "@hono/node-server";
import { app } from "./app";
import { openLocalDb, type LocalDb } from "./db-local";
import { LocalDatabaseConfigError, localDatabaseUrl } from "./local-database";

/**
 * API saat `bun run dev`, dipanggil plugin di vite.config.ts. Database dibuka sekali per proses
 * (disimpan di globalThis, karena modul ini dimuat ulang Vite setiap kali kodenya berubah).
 */
const store = globalThis as typeof globalThis & { __naturaDevDb?: Promise<LocalDb>; __naturaDevDbUrl?: string };

/** Database `bun run dev`: DATABASE_URL, atau PGlite lokal. Juga dipakai seed lewat server dev. */
export function devDb(vars: Record<string, string>): Promise<LocalDb> {
  const url = localDatabaseUrl(vars.DATABASE_URL ?? process.env.DATABASE_URL) ?? "";
  if (store.__naturaDevDb && store.__naturaDevDbUrl !== url)
    throw new LocalDatabaseConfigError("Pengaturan database lokal berubah. Mulai ulang bun run dev agar aplikasi memakai pengaturan yang baru.");
  store.__naturaDevDbUrl = url;
  store.__naturaDevDb ??= openLocalDb(url).then(
    (local) => {
      console.log(`[api] database: ${local.label}`);
      return local;
    },
    (err) => {
      store.__naturaDevDb = undefined;
      throw err;
    },
  );
  return store.__naturaDevDb;
}

export async function handleApi(req: IncomingMessage, res: ServerResponse, vars: Record<string, string>) {
  let local: LocalDb;
  try {
    local = await devDb(vars);
  } catch (err) {
    // Kesalahan konfigurasi ditampilkan di app; kesalahan kode tetap diteruskan ke Vite.
    if (!(err instanceof LocalDatabaseConfigError)) throw err;
    console.error("[api] Database lokal belum siap:", err);
    res.writeHead(503, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    res.end(JSON.stringify({ title: "Database lokal belum siap", error: err.message }));
    return;
  }
  const { db } = local;
  const listener = getRequestListener((request) => app.fetch(request, {
    db, AUTH_SECRET: vars.AUTH_SECRET, APP_URL: vars.APP_URL, DEV: "1",
    TELEGRAM_BOT_TOKEN: vars.TELEGRAM_BOT_TOKEN,
    TELEGRAM_CHAT_ID: vars.TELEGRAM_CHAT_ID,
    TELEGRAM_DISABLED: vars.TELEGRAM_DISABLED,
  }), {
    overrideGlobalObjects: false,
  });
  await listener(req, res);
}
