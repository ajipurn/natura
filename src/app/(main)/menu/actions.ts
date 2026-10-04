"use server";

import { eq, sql } from "drizzle-orm";
import { requireUser, startSession } from "@/server/auth";
import { getDb } from "@/server/db";
import { getString, type FormState } from "@/server/form";
import { hashPin, isValidPin, verifyPin } from "@/server/pin";
import { users } from "@/server/schema";

export async function changePinAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const sessionUser = await requireUser();
  const currentPin = getString(formData, "currentPin");
  const newPin = getString(formData, "newPin");
  const confirmPin = getString(formData, "confirmPin");

  if (!isValidPin(newPin)) return { error: "PIN baru harus 4–6 angka." };
  if (newPin !== confirmPin) return { error: "Konfirmasi PIN baru tidak sama." };

  const db = await getDb();
  const [user] = await db.select().from(users).where(eq(users.id, sessionUser.id)).limit(1);
  if (!user || !(await verifyPin(currentPin, user.pinHash))) return { error: "PIN lama salah." };

  // Naikkan versi sesi: HP lain yang masih login dengan PIN lama akan keluar.
  const [updated] = await db
    .update(users)
    .set({ pinHash: await hashPin(newPin), sessionVersion: sql`${users.sessionVersion} + 1` })
    .where(eq(users.id, user.id))
    .returning({ id: users.id, sessionVersion: users.sessionVersion });
  await startSession(updated);
  return { success: "PIN berhasil diganti." };
}
