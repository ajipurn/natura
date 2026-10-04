"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/server/auth";
import { MAX_AMOUNT } from "@/server/collections";
import { getDb } from "@/server/db";
import { getInt, getString, type FormState } from "@/server/form";
import { settings } from "@/server/schema";

export async function saveSettingsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const communityName = getString(formData, "communityName");
  const defaultAmount = getInt(formData, "defaultAmount");

  if (!communityName || communityName.length > 80) return { error: "Isi nama lingkungan (maks. 80 karakter)." };
  if (defaultAmount == null || defaultAmount <= 0 || defaultAmount > MAX_AMOUNT) {
    return { error: "Nominal jimpitan tidak valid." };
  }

  const db = await getDb();
  await db
    .insert(settings)
    .values({ id: 1, communityName, defaultAmount })
    .onConflictDoUpdate({ target: settings.id, set: { communityName, defaultAmount, updatedAt: new Date() } });
  revalidatePath("/", "layout");
  return { success: "Pengaturan disimpan." };
}
