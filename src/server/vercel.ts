import type { IncomingMessage, ServerResponse } from "node:http";
import { getRequestListener } from "@hono/node-server";
import { app } from "./app";
import { createDb } from "./db";
import type { Bindings } from "./env";
import { waitUntil } from "@vercel/functions";

/**
 * Vercel Function untuk /api/* (dibundel oleh scripts/build-vercel.ts). Koneksi database dibuat
 * sekali per instance dan dipakai bergantian oleh permintaan yang masuk.
 */
let env: Bindings | undefined;

function getEnv(): Bindings {
  if (env) return env;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL belum diisi di Environment Variables Vercel.");
  // Tanpa APP_URL, QR memakai domain production Vercel (bukan alamat preview yang sedang dibuka).
  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  env = {
    db: createDb(url),
    AUTH_SECRET: process.env.AUTH_SECRET,
    APP_URL: process.env.APP_URL || (production ? `https://${production}` : undefined),
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID,
    TELEGRAM_DISABLED: process.env.VERCEL_ENV !== "production" ? "1" : undefined,
    CRON_SECRET: process.env.CRON_SECRET,
    waitUntil,
  };
  return env;
}

const listener = getRequestListener((request) => app.fetch(request, getEnv()));

export default function handler(req: IncomingMessage, res: ServerResponse) {
  // Di belakang proxy Vercel koneksinya http; pakai alamat asli (https) supaya cek CSRF (Origin) cocok.
  const proto = req.headers["x-forwarded-proto"];
  if (proto === "https" || proto === "http") req.url = `${proto}://${req.headers.host}${req.url}`;
  return listener(req, res);
}
