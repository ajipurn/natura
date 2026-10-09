import { can } from "@/lib/permissions";
import { and, eq, inArray, lte, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { formatTime, rondaDate } from "@/lib/dates";
import { formatRupiah } from "@/lib/format";
import { dayLabel, scheduleDay } from "@/lib/schedule";
import { CADENCE_LABEL, planAt } from "@/lib/payments";
import type { EntryInput, EntryResult } from "@/lib/types";
import type { SessionUser } from "./auth";
import { runBatch, type Db, type Executor, type Statement } from "./db";
import { getHouseIds } from "./queries";
import { collectionLogs, collections, paymentPlans, patrols, rondaSchedule, users } from "./schema";

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

/** Satu baris jejak audit (lihat `collectionLogs`). */
type LogWrite = Omit<CollectionWrite, "method"> & {
  clientId: string | null;
  method: EntryInput["method"] | "koreksi";
  onDuty: boolean | null;
};

function logStatements(db: Executor, logs: LogWrite[]): Statement[] {
  if (logs.length === 0) return [];
  return [
    db
      .insert(collectionLogs)
      .values(
        logs.map((l) => ({
          clientId: l.clientId,
          date: l.date,
          houseId: l.houseId,
          userId: l.userId,
          status: l.status,
          amount: l.status === "filled" ? l.amount : 0,
          method: l.method,
          onDuty: l.onDuty,
          recordedAt: l.recordedAt,
        })),
      )
      // Kiriman ulang dari antrean offline tidak dicatat dua kali.
      .onConflictDoNothing({ target: collectionLogs.clientId }),
  ];
}

/** Malam-malam jaga (0 = Ahad) seorang petugas menurut jadwal sekarang. */
export async function dutyDays(db: Db, userId: number): Promise<Set<number>> {
  const rows = await db.selectDistinct({ day: rondaSchedule.dayOfWeek }).from(rondaSchedule).where(eq(rondaSchedule.userId, userId));
  return new Set(rows.map((r) => r.day));
}

const patrolIdFor = (date: string): SQL<number> => sql`(select ${patrols.id} from ${patrols} where ${patrols.date} = ${date})`;

type Stored = { status: "filled" | "empty"; amount: number; collectedBy: number | null; collectorName: string | null; recordedAt: Date };

/** Catatan yang sudah tersimpan untuk malam-malam ini, per `${date}:${houseId}`. */
async function storedFor(db: Db, dates: string[]): Promise<Map<string, Stored>> {
  if (dates.length === 0) return new Map();
  const rows = await db
    .select({
      date: patrols.date,
      houseId: collections.houseId,
      status: collections.status,
      amount: collections.amount,
      collectedBy: collections.collectedBy,
      collectorName: users.name,
      recordedAt: collections.recordedAt,
    })
    .from(collections)
    .innerJoin(patrols, eq(patrols.id, collections.patrolId))
    .leftJoin(users, eq(users.id, collections.collectedBy))
    .where(inArray(patrols.date, dates));
  return new Map(rows.map(({ date, houseId, ...r }) => [`${date}:${houseId}`, r]));
}

/**
 * "Ada" yang dicatat orang lain tidak boleh hilang karena petugas berikutnya menemukan wadah sudah
 * kosong (isinya sudah diambil) lalu mencatat "Kosong" atau menghapus catatan. Catatan seperti itu
 * hanya masuk jejak audit; koreksi admin lewat Riwayat tidak kena aturan ini.
 */
function overwritesOthersFilled(stored: Stored | undefined, write: CollectionWrite): stored is Stored {
  return (
    stored?.status === "filled" &&
    stored.collectedBy !== write.userId &&
    write.status !== "filled" &&
    stored.recordedAt.getTime() <= write.recordedAt.getTime()
  );
}

/**
 * Pernyataan SQL untuk menyimpan (atau menghapus) catatan beberapa rumah. Catatan yang lebih baru
 * menang, jadi sinkron yang telat dari HP lain tidak menimpa koreksi terbaru. Semua dijalankan
 * dalam satu transaksi.
 * `guard` (catatan dari HP petugas): "Ada" milik orang lain tidak ditimpa "Kosong" atau dihapus,
 * juga kalau dua HP sinkron bersamaan (lihat `overwritesOthersFilled`).
 */
function writeStatements(db: Executor, writes: CollectionWrite[], now: Date, guard: boolean): Statement[] {
  if (writes.length === 0) return [];
  const dates = [...new Set(writes.map((w) => w.date))];
  const statements: Statement[] = [
    db
      .insert(patrols)
      .values(dates.map((date) => ({ date })))
      .onConflictDoNothing({ target: patrols.date }),
  ];

  // Hapus satu perintah per malam (dan per pencatat/waktu catat, yang ikut menentukan syaratnya),
  // bukan per rumah: koreksi massal admin di rekap bisa ratusan kotak sekaligus.
  const removals = new Map<string, { date: string; userId: number; recordedAt: Date; houseIds: number[] }>();
  for (const w of writes) {
    if (w.status !== "none") continue;
    const key = `${w.date}|${w.userId}|${w.recordedAt.getTime()}`;
    const group = removals.get(key) ?? { date: w.date, userId: w.userId, recordedAt: w.recordedAt, houseIds: [] };
    group.houseIds.push(w.houseId);
    removals.set(key, group);
  }
  for (const r of removals.values()) {
    statements.push(
      db
        .delete(collections)
        .where(
          and(
            eq(collections.patrolId, patrolIdFor(r.date)),
            inArray(collections.houseId, r.houseIds),
            lte(collections.recordedAt, r.recordedAt),
            guard ? sql`not (${collections.status} = 'filled' and ${collections.collectedBy} is distinct from ${r.userId})` : undefined,
          ),
        ),
    );
  }

  const upserts = writes.filter((w) => w.status !== "none");
  if (upserts.length) {
    statements.push(
      db
        .insert(collections)
        .values(
          upserts.map((w) => ({
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
          setWhere: guard
            ? sql`${collections.recordedAt} <= excluded.recorded_at and not (${collections.status} = 'filled' and excluded.status = 'empty' and ${collections.collectedBy} is distinct from excluded.collected_by)`
            : sql`${collections.recordedAt} <= excluded.recorded_at`,
        }),
    );
  }
  return statements;
}

/** Koreksi admin: simpan (atau hapus) catatan beberapa rumah sekaligus, dan catat di jejak audit. */
export async function writeCollections(db: Db, inputs: CollectionWrite[], now = new Date()) {
  await runBatch(db, (tx) => [
    ...writeStatements(tx, inputs, now, false),
    ...logStatements(
      tx,
      inputs.map((input) => ({ ...input, clientId: null, method: "koreksi" as const, onDuty: null })),
    ),
  ]);
}

/** Terapkan catatan yang dikirim HP petugas (bisa dari antrean offline). */
export async function applyEntries(
  db: Db,
  user: SessionUser,
  entries: EntryInput[],
  now = new Date(),
): Promise<EntryResult[]> {
  const [known, duty, plans] = await Promise.all([getHouseIds(db), dutyDays(db, user.id), db.select().from(paymentPlans)]);
  const results: EntryResult[] = [];
  const logs: LogWrite[] = [];
  // Per malam + rumah cukup simpan catatan terbaru; yang lebih lama toh akan kalah.
  const latest = new Map<string, CollectionWrite>();
  const keyOf = new Map<string, string>();

  for (const entry of entries) {
    const at = new Date(entry.recordedAt);
    const cadence = Number.isNaN(at.getTime()) ? "daily" : planAt(plans, entry.houseId, rondaDate(at))?.cadence ?? "daily";
    const fail = (error: string) => results.push({ clientId: entry.clientId, ok: false, error });

    if (Number.isNaN(at.getTime())) {
      fail("Waktu catatan tidak valid.");
    } else if (at.getTime() > now.getTime() + MAX_CLOCK_SKEW_MS) {
      fail("Jam di HP lebih cepat dari jam server. Periksa pengaturan jam HP.");
    } else if (!can(user.role, "patrols", true) && at.getTime() < now.getTime() - MAX_AGE_MS) {
      fail("Catatan sudah lebih dari 3 hari. Minta admin untuk mengoreksi.");
    } else if (!known.has(entry.houseId)) {
      fail("Rumah tidak ditemukan (mungkin sudah dihapus).");
    } else if (cadence !== "daily") {
      fail(`${CADENCE_LABEL[cadence]} dikelola otomatis dari pembayaran periode. Tidak bisa mencatat Ada/Kosong lewat ronda.`);
    } else if (!duty.has(scheduleDay(rondaDate(at)))) {
      // Hanya yang dijadwalkan jaga malam itu yang boleh scan/catat, admin juga. Admin tetap bisa
      // mengoreksi lewat Riwayat di dashboard (`writeCollections`).
      fail(`Bukan jadwal jagamu: ${dayLabel(scheduleDay(rondaDate(at)))}.`);
    } else {
      const date = rondaDate(at);
      logs.push({
        clientId: entry.clientId,
        date,
        houseId: entry.houseId,
        status: entry.status,
        amount: entry.amount,
        method: entry.method,
        userId: user.id,
        recordedAt: at,
        onDuty: duty.has(scheduleDay(date)),
      });
      const key = `${date}:${entry.houseId}`;
      keyOf.set(entry.clientId, key);
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

  // Catatan yang akan menghapus "Ada" milik petugas lain ditolak (tetap masuk jejak audit).
  const stored = await storedFor(db, [...new Set([...latest.values()].map((w) => w.date))]);
  const blocked = new Map<string, string>();
  for (const [key, write] of latest) {
    const s = stored.get(key);
    if (!overwritesOthersFilled(s, write)) continue;
    blocked.set(
      key,
      `Sudah dicatat Ada ${formatRupiah(s.amount)} oleh ${s.collectorName ?? "petugas lain"} pukul ${formatTime(s.recordedAt)}. ` +
        "Catatanmu tidak dipakai; minta admin mengoreksi kalau memang salah.",
    );
    latest.delete(key);
  }
  const final = results.map((r): EntryResult => {
    const error = r.ok ? blocked.get(keyOf.get(r.clientId)!) : undefined;
    return error ? { clientId: r.clientId, ok: false, error } : r;
  });

  await runBatch(db, (tx) => [...writeStatements(tx, [...latest.values()], now, true), ...logStatements(tx, logs)]);
  return final;
}
