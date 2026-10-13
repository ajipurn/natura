import type { Db } from "./db";
import type { SessionUser } from "./auth";

/** Diberikan ke `app.fetch` oleh `vercel.ts` (production), plugin dev di vite.config.ts, atau tes. */
export type Bindings = {
  db: Db;
  /** Kunci acak ≥ 32 karakter untuk menandatangani sesi login. */
  AUTH_SECRET?: string;
  /** Alamat Info warga untuk QR/link yang dicetak, mis. https://clusternatura.com/info */
  APP_URL?: string;
  /** "1" saat `bun run dev`: cookie tanpa Secure dan secret bawaan boleh dipakai. */
  DEV?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
  /** "1" menonaktifkan pengiriman; preview selalu memakai nilai ini. */
  TELEGRAM_DISABLED?: string;
  CRON_SECRET?: string;
  /** Menjaga pekerjaan latar tetap hidup setelah respons Vercel dikirim. */
  waitUntil?: (task: Promise<unknown>) => void;
};

export type AppEnv = {
  Bindings: Bindings;
  Variables: { db: Db; user: SessionUser };
};
