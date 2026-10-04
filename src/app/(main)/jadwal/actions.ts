"use server";

import { revalidatePath } from "next/cache";
import { parseSchedule } from "@/lib/schedule";
import { requireAdmin } from "@/server/auth";
import { getString, type FormState } from "@/server/form";
import { clearSchedule, saveSchedule } from "@/server/schedule";

const MAX_TEXT = 50_000;
const MAX_ENTRIES = 1000;

export async function importScheduleAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const text = getString(formData, "text");
  if (!text) return { error: "Tempel jadwalnya dulu." };
  if (text.length > MAX_TEXT) return { error: "Teks jadwal terlalu panjang." };

  const { entries } = parseSchedule(text);
  if (entries.length === 0) {
    return { error: "Tidak ada jadwal yang terbaca. Pastikan ada nama hari dan kode rumah seperti (AD-3)." };
  }
  if (entries.length > MAX_ENTRIES) return { error: "Jadwal terlalu banyak barisnya." };

  const fillNames = formData.get("fillNames") === "on";
  const summary = await saveSchedule(entries, {
    fillNames,
    overwriteNames: formData.get("overwriteNames") === "on",
  });
  revalidatePath("/jadwal");
  revalidatePath("/admin/rumah");

  const parts = [`${summary.saved} baris jadwal tersimpan untuk ${summary.days} malam.`];
  if (fillNames) parts.push(`${summary.namesFilled} nama KK diisi.`);
  if (summary.unknown.length) parts.push(`Belum ada di data rumah: ${summary.unknown.join(", ")}.`);
  if (summary.conflicting.length) parts.push(`Nama ganda, tidak diisi: ${summary.conflicting.join("; ")}.`);
  return { success: parts.join(" ") };
}

export async function clearScheduleAction(): Promise<FormState> {
  await requireAdmin();
  await clearSchedule();
  revalidatePath("/jadwal");
  return { success: "Jadwal dihapus." };
}
