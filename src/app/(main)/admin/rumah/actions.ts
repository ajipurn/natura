"use server";

import { and, eq, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { normalizeHouseField, parseNumberList } from "@/lib/houses";
import { newToken } from "@/lib/qr";
import { requireAdmin } from "@/server/auth";
import { getDb } from "@/server/db";
import { getInt, getString, type FormState } from "@/server/form";
import { collections, houses } from "@/server/schema";

const MAX_FIELD = 10;

function validBlock(block: string) {
  return /^[0-9A-Z][0-9A-Z .\-/]{0,9}$/.test(block);
}

function validNumber(number: string) {
  return /^[0-9A-Z][0-9A-Z\-/]{0,9}$/.test(number);
}

function revalidateHouses() {
  revalidatePath("/admin/rumah");
  revalidatePath("/ronda");
}

/** Tambah satu rumah atau banyak sekaligus ("1-20", "1, 3, 5"). */
export async function addHousesAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const block = normalizeHouseField(getString(formData, "block"));
  const numbers = parseNumberList(getString(formData, "numbers"));
  const ownerName = getString(formData, "ownerName").slice(0, 80) || null;

  if (!validBlock(block)) return { error: `Blok wajib diisi (huruf/angka, maks. ${MAX_FIELD} karakter).` };
  if (!numbers || numbers.some((n) => !validNumber(n))) {
    return { error: "Format nomor salah. Contoh: 12, atau 1-20, atau 1, 3, 5A." };
  }

  const db = await getDb();
  const inserted = await db
    .insert(houses)
    .values(
      numbers.map((number) => ({
        block,
        number,
        // Nama KK hanya dipakai kalau menambah satu rumah.
        ownerName: numbers.length === 1 ? ownerName : null,
        token: newToken(),
      })),
    )
    .onConflictDoNothing({ target: [houses.block, houses.number] })
    .returning({ id: houses.id });

  revalidateHouses();
  const skipped = numbers.length - inserted.length;
  if (inserted.length === 0) return { error: `Semua nomor di blok ${block} sudah terdaftar.` };
  return {
    success: `${inserted.length} rumah ditambahkan ke blok ${block}.${skipped ? ` ${skipped} sudah ada, dilewati.` : ""}`,
  };
}

export async function updateHouseAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const id = getInt(formData, "id");
  const block = normalizeHouseField(getString(formData, "block"));
  const number = normalizeHouseField(getString(formData, "number"));
  const ownerName = getString(formData, "ownerName").slice(0, 80) || null;
  const status = getString(formData, "status");

  if (!id) return { error: "Data tidak valid." };
  if (!validBlock(block) || !validNumber(number)) return { error: "Blok/nomor tidak valid." };
  if (status !== "active" && status !== "vacant") return { error: "Status tidak valid." };

  const db = await getDb();
  const [duplicate] = await db
    .select({ id: houses.id })
    .from(houses)
    .where(and(eq(houses.block, block), eq(houses.number, number), ne(houses.id, id)))
    .limit(1);
  if (duplicate) return { error: `Rumah ${block}-${number} sudah ada.` };

  await db.update(houses).set({ block, number, ownerName, status }).where(eq(houses.id, id));
  revalidateHouses();
  return { success: "Tersimpan." };
}

/** Buat kode QR baru (mis. stiker hilang/rusak). Stiker lama tidak berlaku lagi. */
export async function regenerateTokenAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const id = getInt(formData, "id");
  if (!id) return { error: "Data tidak valid." };
  const db = await getDb();
  await db.update(houses).set({ token: newToken() }).where(eq(houses.id, id));
  revalidateHouses();
  return { success: "QR baru dibuat. Cetak ulang stiker rumah ini." };
}

export async function deleteHouseAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const id = getInt(formData, "id");
  if (!id) return { error: "Data tidak valid." };
  const db = await getDb();
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(collections)
    .where(eq(collections.houseId, id));
  if (count > 0) {
    return { error: "Rumah ini sudah punya catatan jimpitan. Tandai sebagai kosong/mudik saja." };
  }
  await db.delete(houses).where(eq(houses.id, id));
  revalidateHouses();
  return { success: "Rumah dihapus." };
}
