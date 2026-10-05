import type { D1, Db } from "./db";
import type { SessionUser } from "./auth";

/** Binding Cloudflare (lihat wrangler.jsonc). */
export type Bindings = {
  DB: D1;
  /** File hasil build Vite (Workers Static Assets). */
  ASSETS: { fetch: (request: Request) => Promise<Response> };
  /** Secret: kunci acak ≥ 32 karakter untuk menandatangani sesi login. */
  AUTH_SECRET?: string;
  /** Alamat publik aplikasi untuk QR yang dicetak, mis. https://jimpitan.example.workers.dev */
  APP_URL?: string;
  /** "1" saat `bun run dev`: cookie tanpa Secure dan secret bawaan boleh dipakai. */
  DEV?: string;
};

export type AppEnv = {
  Bindings: Bindings;
  Variables: { db: Db; user: SessionUser };
};
