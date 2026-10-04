"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth";
import { applyEntries, MAX_AMOUNT } from "@/server/collections";
import { getHouseByToken } from "@/server/queries";

/** Petugas yang membuka QR lewat kamera HP biasa bisa langsung mencatat dari halaman rumah. */
export async function recordFromHousePage(
  token: string,
  status: "filled" | "empty" | "none",
  amount: number,
): Promise<{ error?: string }> {
  const user = await requireUser();
  if (typeof token !== "string" || token.length > 64) return { error: "Kode rumah tidak valid." };
  const house = await getHouseByToken(token);
  if (!house) return { error: "Rumah tidak ditemukan." };
  if (!["filled", "empty", "none"].includes(status)) return { error: "Status tidak valid." };
  if (!Number.isInteger(amount) || amount < 0 || amount > MAX_AMOUNT) return { error: "Nominal tidak valid." };

  const [result] = await applyEntries(user, [
    {
      clientId: crypto.randomUUID(),
      houseId: house.id,
      status,
      amount,
      method: "scan",
      recordedAt: new Date().toISOString(),
    },
  ]);
  if (!result.ok) return { error: result.error };
  revalidatePath(`/r/${house.token}`);
  return {};
}
