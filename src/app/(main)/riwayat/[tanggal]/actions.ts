"use server";

import { revalidatePath } from "next/cache";
import { isIsoDate } from "@/lib/dates";
import { requireAdmin } from "@/server/auth";
import { MAX_AMOUNT, writeCollection } from "@/server/collections";
import { getInt, getString, type FormState } from "@/server/form";
import { getHousesByIds } from "@/server/queries";

/** Koreksi catatan oleh admin untuk tanggal mana pun. */
export async function correctCollection(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const date = getString(formData, "date");
  const houseId = getInt(formData, "houseId");
  const status = getString(formData, "status");
  const amount = getInt(formData, "amount") ?? 0;

  if (!isIsoDate(date) || !houseId) return { error: "Data tidak valid." };
  if (status !== "filled" && status !== "empty" && status !== "none") return { error: "Status tidak valid." };
  if (status === "filled" && (amount <= 0 || amount > MAX_AMOUNT)) return { error: "Isi nominal yang benar." };
  if ((await getHousesByIds([houseId])).length === 0) return { error: "Rumah tidak ditemukan." };

  await writeCollection({
    date,
    houseId,
    status,
    amount,
    method: "manual",
    userId: admin.id,
    recordedAt: new Date(),
  });
  revalidatePath(`/riwayat/${date}`);
  return { success: "Tersimpan." };
}
