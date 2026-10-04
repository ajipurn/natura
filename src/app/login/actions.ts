"use server";

import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { endSession, startSession } from "@/server/auth";
import { getDb } from "@/server/db";
import { getInt, getString, safeNextPath, type FormState } from "@/server/form";
import { verifyPin } from "@/server/pin";
import { users } from "@/server/schema";

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const userId = getInt(formData, "userId");
  const pin = getString(formData, "pin");
  if (!userId) return { error: "Pilih nama kamu dulu." };
  if (!pin) return { error: "Masukkan PIN." };

  const db = await getDb();
  const now = new Date();

  // Catat percobaan secara atomik SEBELUM memeriksa PIN, supaya permintaan paralel
  // tidak bisa mencoba lebih dari MAX_ATTEMPTS PIN per periode kunci.
  const [attempt] = await db
    .update(users)
    .set({ failedAttempts: sql`${users.failedAttempts} + 1` })
    .where(
      and(
        eq(users.id, userId),
        eq(users.active, true),
        or(isNull(users.lockedUntil), lt(users.lockedUntil, now)),
      ),
    )
    .returning({
      id: users.id,
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
    if (!user || !user.active) return { error: "Akun tidak ditemukan atau dinonaktifkan." };
    const minutes = Math.max(1, Math.ceil(((user.lockedUntil?.getTime() ?? 0) - now.getTime()) / 60_000));
    return { error: `Terlalu banyak PIN salah. Coba lagi dalam ${minutes} menit.` };
  }

  const lock = () =>
    db
      .update(users)
      .set({ failedAttempts: 0, lockedUntil: new Date(now.getTime() + LOCK_MINUTES * 60_000) })
      .where(eq(users.id, attempt.id));
  const lockedMessage = `PIN salah ${MAX_ATTEMPTS} kali. Akun dikunci ${LOCK_MINUTES} menit.`;

  if (attempt.failedAttempts > MAX_ATTEMPTS) {
    // Batas sudah habis oleh percobaan lain yang berjalan bersamaan; PIN ini tidak diperiksa.
    await lock();
    return { error: `Terlalu banyak PIN salah. Coba lagi dalam ${LOCK_MINUTES} menit.` };
  }

  if (!(await verifyPin(pin, attempt.pinHash))) {
    if (attempt.failedAttempts >= MAX_ATTEMPTS) {
      await lock();
      return { error: lockedMessage };
    }
    return { error: `PIN salah. Sisa ${MAX_ATTEMPTS - attempt.failedAttempts} percobaan.` };
  }

  await db.update(users).set({ failedAttempts: 0, lockedUntil: null }).where(eq(users.id, attempt.id));
  await startSession(attempt);
  redirect(safeNextPath(getString(formData, "next"), "/ronda"));
}

export async function logoutAction() {
  await endSession();
  redirect("/login");
}
