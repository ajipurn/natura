import { and, eq, lte, sql, type SQL } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { z } from "zod";
import { rondaDate } from "@/lib/dates";
import type { EntryInput, EntryResult } from "@/lib/types";
import type { SessionUser } from "./auth";
import { chunk, rowsPerInsert, runBatch, type Db } from "./db";
import { getHouseIds } from "./queries";
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
  entries: z.array(entrySchema).max(500),
});

export type CollectionWrite = {
  date: string;
  houseId: number;
  status: EntryInput["status"];
  amount: number;
  method: EntryInput["method"];
  userId: number;
  recordedAt: Date;
};

const patrolIdFor = (date: string): SQL<number> => sql`(select ${patrols.id} from ${patrols} where ${patrols.date} = ${date})`;

/**
 * Pernyataan SQL untuk menyimpan (atau menghapus) catatan beberapa rumah. Catatan yang lebih baru
 * menang, jadi sinkron yang telat dari HP lain tidak menimpa koreksi terbaru. Semua dijalankan
 * dalam satu batch D1 (satu perjalanan ke database).
 */
function writeStatements(db: Db, writes: CollectionWrite[], now: Date): BatchItem<"sqlite">[] {
  if (writes.length === 0) return [];
  const statements: BatchItem<"sqlite">[] = [];

  const dates = [...new Set(writes.map((w) => w.date))];
  for (const part of chunk(dates, rowsPerInsert(2))) {
    statements.push(
      db
        .insert(patrols)
        .values(part.map((date) => ({ date })))
        .onConflictDoNothing({ target: patrols.date }),
    );
  }

  for (const w of writes.filter((w) => w.status === "none")) {
    statements.push(
      db
        .delete(collections)
        .where(
          and(
            eq(collections.patrolId, patrolIdFor(w.date)),
            eq(collections.houseId, w.houseId),
            lte(collections.recordedAt, w.recordedAt),
          ),
        ),
    );
  }

  const upserts = writes.filter((w) => w.status !== "none");
  for (const part of chunk(upserts, rowsPerInsert(8))) {
    statements.push(
      db
        .insert(collections)
        .values(
          part.map((w) => ({
            patrolId: patrolIdFor(w.date),
            houseId: w.houseId,
            status: w.status as "filled" | "empty",
            amount: w.status === "filled" ? w.amount : 0,
            method: w.method,
            collectedBy: w.userId,
            recordedAt: w.recordedAt,
            syncedAt: now,
          })),
        )
        .onConflictDoUpdate({
          target: [collections.patrolId, collections.houseId],
          set: {
            status: sql`excluded.status`,
            amount: sql`excluded.amount`,
            method: sql`excluded.method`,
            collectedBy: sql`excluded.collected_by`,
            recordedAt: sql`excluded.recorded_at`,
            syncedAt: sql`excluded.synced_at`,
          },
          setWhere: sql`${collections.recordedAt} <= excluded.recorded_at`,
        }),
    );
  }
  return statements;
}

/** Simpan (atau hapus) catatan satu rumah untuk satu malam (koreksi admin, catat dari halaman rumah). */
export async function writeCollection(db: Db, input: CollectionWrite, now = new Date()) {
  await runBatch(db, writeStatements(db, [input], now));
}

/** Terapkan catatan yang dikirim HP petugas (bisa dari antrean offline). */
export async function applyEntries(
  db: Db,
  user: SessionUser,
  entries: EntryInput[],
  now = new Date(),
): Promise<EntryResult[]> {
  const known = await getHouseIds(db);
  const results: EntryResult[] = [];
  // Per malam + rumah cukup simpan catatan terbaru; yang lebih lama toh akan kalah.
  const latest = new Map<string, CollectionWrite>();

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
      const key = `${date}:${entry.houseId}`;
      const previous = latest.get(key);
      if (!previous || previous.recordedAt.getTime() <= at.getTime()) {
        latest.set(key, {
          date,
          houseId: entry.houseId,
          status: entry.status,
          amount: entry.amount,
          method: entry.method,
          userId: user.id,
          recordedAt: at,
        });
      }
      results.push({ clientId: entry.clientId, ok: true, date });
    }
  }

  await runBatch(db, writeStatements(db, [...latest.values()], now));
  return results;
}
