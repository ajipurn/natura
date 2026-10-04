"use server";

import { and, eq, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/server/auth";
import { getDb } from "@/server/db";
import { getInt, getString, type FormState } from "@/server/form";
import { hashPin, isValidPin } from "@/server/pin";
import { users } from "@/server/schema";

function validName(name: string) {
  return name.length > 0 && name.length <= 40;
}

async function nameTaken(name: string, exceptId?: number) {
  const db = await getDb();
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(
      exceptId
        ? and(sql`lower(${users.name}) = lower(${name})`, ne(users.id, exceptId))
        : sql`lower(${users.name}) = lower(${name})`,
    )
    .limit(1);
  return rows.length > 0;
}

export async function createUserAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const name = getString(formData, "name");
  const pin = getString(formData, "pin");
  const role = getString(formData, "role") === "admin" ? "admin" : "petugas";

  if (!validName(name)) return { error: "Isi nama (maks. 40 karakter)." };
  if (!isValidPin(pin)) return { error: "PIN harus 4–6 angka." };
  if (await nameTaken(name)) return { error: `Nama "${name}" sudah dipakai.` };

  const db = await getDb();
  await db.insert(users).values({ name, pinHash: await hashPin(pin), role });
  revalidatePath("/admin/petugas");
  return { success: `${name} ditambahkan. Beri tahu PIN-nya secara langsung.` };
}

export async function updateUserAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const id = getInt(formData, "id");
  const name = getString(formData, "name");
  const role = getString(formData, "role") === "admin" ? "admin" : "petugas";
  const active = getString(formData, "active") === "on";

  if (!id) return { error: "Data tidak valid." };
  if (!validName(name)) return { error: "Isi nama (maks. 40 karakter)." };
  if (await nameTaken(name, id)) return { error: `Nama "${name}" sudah dipakai.` };
  if (id === admin.id && (!active || role !== "admin")) {
    return { error: "Tidak bisa menonaktifkan atau menurunkan peran akunmu sendiri." };
  }

  const db = await getDb();
  await db.update(users).set({ name, role, active }).where(eq(users.id, id));
  revalidatePath("/admin/petugas");
  return { success: "Tersimpan." };
}

export async function resetPinAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const id = getInt(formData, "id");
  const pin = getString(formData, "pin");
  if (!id) return { error: "Data tidak valid." };
  if (!isValidPin(pin)) return { error: "PIN harus 4–6 angka." };

  const db = await getDb();
  await db
    .update(users)
    .set({
      pinHash: await hashPin(pin),
      failedAttempts: 0,
      lockedUntil: null,
      // Keluarkan sesi lama di semua HP.
      sessionVersion: sql`${users.sessionVersion} + 1`,
    })
    .where(eq(users.id, id));
  revalidatePath("/admin/petugas");
  return { success: "PIN diatur ulang. Petugas perlu masuk lagi dengan PIN baru." };
}
