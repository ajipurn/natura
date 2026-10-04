import "server-only";
import { and, eq, lte } from "drizzle-orm";
import { z } from "zod";
import { rondaDate } from "@/lib/dates";
import type { EntryInput, EntryResult } from "@/lib/types";
import type { SessionUser } from "./auth";
import { getDb, type Db } from "./db";
import { getHousesByIds } from "./queries";
import { collections, patrols } from "./schema";

const MAX_CLOCK_SKEW_MS = 10 * 60 * 1000;
/** Petugas hanya bisa menyinkronkan catatan sampai 3 hari ke belakang; selebihnya lewat admin. */
const MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;
export const MAX_AMOUNT = 1_000_000;

export const entrySchema = z.object({
  clientId: z.string().min(1).max(64),
  houseId: z.number().int().positive(),
  status: z.enum(["filled", "empty", "none"]),
  amount: z.number().int().min(0).max(MAX_AMOUNT),
  method: z.enum(["scan", "manual"]),
  recordedAt: z.iso.datetime({ offset: true }),
});

export const entriesSchema = z.object({
  entries: z.array(entrySchema).max(1000),
});

async function ensurePatrol(db: Db, date: string): Promise<number> {
  const [row] = await db
    .insert(patrols)
    .values({ date })
    .onConflictDoUpdate({ target: patrols.date, set: { date } })
    .returning({ id: patrols.id });
  return row.id;
}

type WriteInput = {
  date: string;
  houseId: number;
  status: EntryInput["status"];
  amount: number;
  method: EntryInput["method"];
  userId: number;
  recordedAt: Date;
};

/**
 * Simpan (atau hapus) catatan satu rumah untuk satu malam.
 * Catatan yang lebih baru menang, jadi sinkron yang telat dari HP lain tidak menimpa koreksi terbaru.
 */
export async function writeCollection(input: WriteInput, now = new Date()) {
  const db = await getDb();
  const patrolId = await ensurePatrol(db, input.date);

  if (input.status === "none") {
    await db
      .delete(collections)
      .where(
        and(
          eq(collections.patrolId, patrolId),
          eq(collections.houseId, input.houseId),
          lte(collections.recordedAt, input.recordedAt),
        ),
      );
    return;
  }

  const values = {
    status: input.status,
    amount: input.status === "filled" ? input.amount : 0,
    method: input.method,
    collectedBy: input.userId,
    recordedAt: input.recordedAt,
    syncedAt: now,
  };
  await db
    .insert(collections)
    .values({ patrolId, houseId: input.houseId, ...values })
    .onConflictDoUpdate({
      target: [collections.patrolId, collections.houseId],
      set: values,
      setWhere: lte(collections.recordedAt, input.recordedAt),
    });
}

/** Terapkan catatan yang dikirim HP petugas (bisa dari antrean offline). */
export async function applyEntries(
  user: SessionUser,
  entries: EntryInput[],
  now = new Date(),
): Promise<EntryResult[]> {
  const known = new Set(
    (await getHousesByIds([...new Set(entries.map((e) => e.houseId))])).map((h) => h.id),
  );

  const results: EntryResult[] = [];
  for (const entry of entries) {
    const at = new Date(entry.recordedAt);
    const fail = (error: string) => results.push({ clientId: entry.clientId, ok: false, error });

    if (Number.isNaN(at.getTime())) {
      fail("Waktu catatan tidak valid.");
    } else if (at.getTime() > now.getTime() + MAX_CLOCK_SKEW_MS) {
      fail("Jam di HP lebih cepat dari jam server. Periksa pengaturan jam HP.");
    } else if (user.role !== "admin" && at.getTime() < now.getTime() - MAX_AGE_MS) {
      fail("Catatan sudah lebih dari 3 hari. Minta admin untuk mengoreksi.");
    } else if (!known.has(entry.houseId)) {
      fail("Rumah tidak ditemukan (mungkin sudah dihapus).");
    } else {
      const date = rondaDate(at);
      await writeCollection(
        {
          date,
          houseId: entry.houseId,
          status: entry.status,
          amount: entry.amount,
          method: entry.method,
          userId: user.id,
          recordedAt: at,
        },
        now,
      );
      results.push({ clientId: entry.clientId, ok: true, date });
    }
  }
  return results;
}
