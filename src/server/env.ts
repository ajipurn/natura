import type { Db } from "./db";
import type { SessionUser } from "./auth";

/** Diberikan ke `app.fetch` oleh `vercel.ts` (production), plugin dev di vite.config.ts, atau tes. */
export type Bindings = {
  db: Db;
  /** Kunci acak ≥ 32 karakter untuk menandatangani sesi login. */
  AUTH_SECRET?: string;
  /** Alamat publik aplikasi untuk QR yang dicetak, mis. https://jimpitan-natura.vercel.app */
  APP_URL?: string;
  /** "1" saat `bun run dev`: cookie tanpa Secure dan secret bawaan boleh dipakai. */
  DEV?: string;
};

export type AppEnv = {
  Bindings: Bindings;
  Variables: { db: Db; user: SessionUser };
};
