"use server";

import { redirect } from "next/navigation";
import { startSession } from "@/server/auth";
import { MAX_AMOUNT } from "@/server/collections";
import { getDb } from "@/server/db";
import { getInt, getString, type FormState } from "@/server/form";
import { hashPin, isValidPin } from "@/server/pin";
import { hasAnyUser } from "@/server/queries";
import { settings, users } from "@/server/schema";

export async function setupAction(_prev: FormState, formData: FormData): Promise<FormState> {
  if (await hasAnyUser()) redirect("/login");

  const communityName = getString(formData, "communityName");
  const defaultAmount = getInt(formData, "defaultAmount");
  const name = getString(formData, "name");
  const pin = getString(formData, "pin");
  const pinConfirm = getString(formData, "pinConfirm");

  if (!communityName || communityName.length > 80) return { error: "Isi nama lingkungan (maks. 80 karakter)." };
  if (defaultAmount == null || defaultAmount <= 0 || defaultAmount > MAX_AMOUNT) {
    return { error: "Nominal jimpitan tidak valid." };
  }
  if (!name || name.length > 40) return { error: "Isi nama admin (maks. 40 karakter)." };
  if (!isValidPin(pin)) return { error: "PIN harus 4–6 angka." };
  if (pin !== pinConfirm) return { error: "Konfirmasi PIN tidak sama." };

  const db = await getDb();
  const pinHash = await hashPin(pin);
  const user = await db.transaction(async (tx) => {
    await tx
      .insert(settings)
      .values({ id: 1, communityName, defaultAmount })
      .onConflictDoUpdate({ target: settings.id, set: { communityName, defaultAmount, updatedAt: new Date() } });
    const [created] = await tx
      .insert(users)
      .values({ name, pinHash, role: "admin" })
      .returning({ id: users.id, sessionVersion: users.sessionVersion });
    return created;
  });

  await startSession(user);
  redirect("/admin/rumah");
}
