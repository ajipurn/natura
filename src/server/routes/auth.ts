import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { endSession, getSessionUser, requireUser, startSession } from "../auth";
import { MAX_AMOUNT } from "../collections";
import type { AppEnv } from "../env";
import { body, pinField, trimmed } from "../http";
import { hashPin, verifyPin } from "../pin";
import { hasAnyUser, listLoginUsers } from "../queries";
import { settings, users } from "../schema";

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

const loginSchema = z.object({
  userId: z.number("Pilih nama kamu dulu.").int().positive("Pilih nama kamu dulu."),
  pin: z.string().min(1, "Masukkan PIN.").max(12, "PIN salah."),
});

const setupSchema = z
  .object({
    communityName: trimmed(80, "Isi nama lingkungan (maks. 80 karakter).").min(1, "Isi nama lingkungan (maks. 80 karakter)."),
    defaultAmount: z.number("Nominal jimpitan tidak valid.").int().positive("Nominal jimpitan tidak valid.").max(MAX_AMOUNT, "Nominal jimpitan tidak valid."),
    name: trimmed(40, "Isi nama admin (maks. 40 karakter).").min(1, "Isi nama admin (maks. 40 karakter)."),
    pin: pinField(),
    pinConfirm: z.string(),
  })
  .refine((v) => v.pin === v.pinConfirm, "Konfirmasi PIN tidak sama.");

const changePinSchema = z
  .object({
    currentPin: z.string().max(12),
    newPin: pinField("PIN baru harus 4–6 angka."),
    confirmPin: z.string(),
  })
  .refine((v) => v.newPin === v.confirmPin, "Konfirmasi PIN baru tidak sama.");

export const authRoutes = new Hono<AppEnv>()
  /** Status awal aplikasi: perlu setup? siapa yang login? */
  .get("/", async (c) => {
    const [user, anyUser] = await Promise.all([getSessionUser(c), hasAnyUser(c.var.db)]);
    return c.json({ setupNeeded: !anyUser, user });
  })

  /** Daftar nama untuk layar masuk. */
  .get("/users", async (c) => c.json({ users: await listLoginUsers(c.var.db) }))

  .post("/login", body(loginSchema), async (c) => {
    const { userId, pin } = c.req.valid("json");
    const db = c.var.db;
    const now = new Date();

    // Catat percobaan secara atomik SEBELUM memeriksa PIN, supaya permintaan paralel
    // tidak bisa mencoba lebih dari MAX_ATTEMPTS PIN per periode kunci.
    const [attempt] = await db
      .update(users)
      .set({ failedAttempts: sql`${users.failedAttempts} + 1` })
      .where(
        and(eq(users.id, userId), eq(users.active, true), or(isNull(users.lockedUntil), lt(users.lockedUntil, now))),
      )
      .returning({
        id: users.id,
        name: users.name,
        role: users.role,
        pinHash: users.pinHash,
        sessionVersion: users.sessionVersion,
        failedAttempts: users.failedAttempts,
      });

    if (!attempt) {
      const [user] = await db
        .select({ active: users.active, lockedUntil: users.lockedUntil })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      if (!user || !user.active) return c.json({ error: "Akun tidak ditemukan atau dinonaktifkan." }, 400);
      const minutes = Math.max(1, Math.ceil(((user.lockedUntil?.getTime() ?? 0) - now.getTime()) / 60_000));
      return c.json({ error: `Terlalu banyak PIN salah. Coba lagi dalam ${minutes} menit.` }, 429);
    }

    const lock = () =>
      db
        .update(users)
        .set({ failedAttempts: 0, lockedUntil: new Date(now.getTime() + LOCK_MINUTES * 60_000) })
        .where(eq(users.id, attempt.id));

    if (attempt.failedAttempts > MAX_ATTEMPTS) {
      // Batas sudah habis oleh percobaan lain yang berjalan bersamaan; PIN ini tidak diperiksa.
      await lock();
      return c.json({ error: `Terlalu banyak PIN salah. Coba lagi dalam ${LOCK_MINUTES} menit.` }, 429);
    }

    if (!(await verifyPin(pin, attempt.pinHash))) {
      if (attempt.failedAttempts >= MAX_ATTEMPTS) {
        await lock();
        return c.json({ error: `PIN salah ${MAX_ATTEMPTS} kali. Akun dikunci ${LOCK_MINUTES} menit.` }, 429);
      }
      return c.json({ error: `PIN salah. Sisa ${MAX_ATTEMPTS - attempt.failedAttempts} percobaan.` }, 400);
    }

    await db.update(users).set({ failedAttempts: 0, lockedUntil: null }).where(eq(users.id, attempt.id));
    await startSession(c, attempt);
    return c.json({ user: { id: attempt.id, name: attempt.name, role: attempt.role } });
  })

  .post("/logout", (c) => {
    endSession(c);
    return c.json({ ok: true });
  })

  /** Pertama kali dipakai: buat admin pertama dan pengaturan. */
  .post("/setup", body(setupSchema), async (c) => {
    const db = c.var.db;
    if (await hasAnyUser(db)) return c.json({ error: "Aplikasi sudah disiapkan. Silakan masuk." }, 409);
    const { communityName, defaultAmount, name, pin } = c.req.valid("json");
    const pinHash = await hashPin(pin);
    const [, [user]] = await db.batch([
      db
        .insert(settings)
        .values({ id: 1, communityName, defaultAmount })
        .onConflictDoUpdate({ target: settings.id, set: { communityName, defaultAmount, updatedAt: new Date() } }),
      db
        .insert(users)
        .values({ name, pinHash, role: "admin" })
        .returning({ id: users.id, name: users.name, role: users.role, sessionVersion: users.sessionVersion }),
    ]);
    await startSession(c, user);
    return c.json({ user: { id: user.id, name: user.name, role: user.role } });
  })

  .post("/pin", requireUser, body(changePinSchema), async (c) => {
    const { currentPin, newPin } = c.req.valid("json");
    const db = c.var.db;
    const [user] = await db.select().from(users).where(eq(users.id, c.var.user.id)).limit(1);
    if (!user || !(await verifyPin(currentPin, user.pinHash))) return c.json({ error: "PIN lama salah." }, 400);

    // Naikkan versi sesi: HP lain yang masih login dengan PIN lama akan keluar.
    const [updated] = await db
      .update(users)
      .set({ pinHash: await hashPin(newPin), sessionVersion: sql`${users.sessionVersion} + 1` })
      .where(eq(users.id, user.id))
      .returning({ id: users.id, sessionVersion: users.sessionVersion });
    await startSession(c, updated);
    return c.json({ success: "PIN berhasil diganti." });
  });
