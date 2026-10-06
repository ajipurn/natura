import { and, desc, eq, sql } from "drizzle-orm";
import { NEW_SLOT_COLOR } from "@/lib/guard-color";
import { runBatch, type Db, type Executor } from "./db";
import { guardDaysByUser } from "./schedule";
import { houses, rondaSchedule, scheduleRequests, users } from "./schema";

const requestColumns = {
  id: scheduleRequests.id,
  fromDay: scheduleRequests.fromDay,
  toDay: scheduleRequests.toDay,
  note: scheduleRequests.note,
  status: scheduleRequests.status,
  response: scheduleRequests.response,
  createdAt: scheduleRequests.createdAt,
  decidedAt: scheduleRequests.decidedAt,
};

/** Permintaan ubah jadwal milik satu petugas, terbaru dulu. */
export function listOwnRequests(db: Db, userId: number) {
  return db
    .select(requestColumns)
    .from(scheduleRequests)
    .where(eq(scheduleRequests.userId, userId))
    .orderBy(desc(scheduleRequests.createdAt))
    .limit(10);
}

/** Semua permintaan untuk admin: yang menunggu dulu, lalu 30 yang terakhir diputuskan. */
export async function listRequestsForAdmin(db: Db) {
  const [rows, days] = await Promise.all([
    db
      .select({
        ...requestColumns,
        userId: scheduleRequests.userId,
        userName: users.name,
        block: houses.block,
        number: houses.number,
        decidedBy: sql<string | null>`(select ${users.name} from ${users} where ${users.id} = ${scheduleRequests.decidedBy})`,
      })
      .from(scheduleRequests)
      .innerJoin(users, eq(users.id, scheduleRequests.userId))
      .leftJoin(houses, eq(houses.id, users.houseId))
      .orderBy(sql`${scheduleRequests.status} = 'pending' desc`, desc(scheduleRequests.createdAt))
      .limit(60),
    guardDaysByUser(db),
  ]);
  const pending = rows.filter((r) => r.status === "pending");
  const decided = rows.filter((r) => r.status !== "pending").slice(0, 30);
  return [...pending, ...decided].map(({ block, number, ...r }) => ({
    ...r,
    house: block && number ? `${block}-${number}` : null,
    /** Malam jaga petugas saat ini. */
    days: days.get(r.userId) ?? [],
  }));
}

export async function countPendingRequests(db: Db): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(scheduleRequests)
    .where(eq(scheduleRequests.status, "pending"));
  return row?.n ?? 0;
}

type RequestInput = { fromDay: number | null; toDay: number; note: string | null };

/** Buat permintaan baru. Mengembalikan pesan kesalahan kalau permintaannya tidak masuk akal. */
export async function createRequest(db: Db, userId: number, input: RequestInput): Promise<string | null> {
  const days = (await guardDaysByUser(db)).get(userId) ?? [];
  if (input.fromDay !== null && !days.includes(input.fromDay)) return "Kamu tidak dijadwalkan di malam itu.";
  if (input.fromDay === input.toDay) return "Pilih malam yang berbeda.";
  if (days.includes(input.toDay)) return "Kamu sudah jaga di malam yang dipilih.";
  const [pending] = await db
    .select({ id: scheduleRequests.id })
    .from(scheduleRequests)
    .where(and(eq(scheduleRequests.userId, userId), eq(scheduleRequests.status, "pending")))
    .limit(1);
  if (pending) return "Masih ada permintaan yang menunggu. Batalkan dulu kalau mau mengganti.";
  await db.insert(scheduleRequests).values({ userId, ...input });
  return null;
}

/** Petugas membatalkan permintaannya sendiri yang masih menunggu. */
export async function cancelRequest(db: Db, userId: number, id: number): Promise<boolean> {
  const rows = await db
    .update(scheduleRequests)
    .set({ status: "cancelled", decidedAt: new Date() })
    .where(and(eq(scheduleRequests.id, id), eq(scheduleRequests.userId, userId), eq(scheduleRequests.status, "pending")))
    .returning({ id: scheduleRequests.id });
  return rows.length > 0;
}

/**
 * Admin memutuskan permintaan. Kalau disetujui, baris jadwal petugas dipindah dari malam lama ke
 * malam baru (urutan terakhir; warnanya ikut), atau ditambahkan kalau belum punya jadwal.
 */
export async function decideRequest(
  db: Db,
  id: number,
  adminId: number,
  decision: "approved" | "rejected",
  response: string | null,
): Promise<string | null> {
  const [request] = await db
    .select({ userId: scheduleRequests.userId, fromDay: scheduleRequests.fromDay, toDay: scheduleRequests.toDay, status: scheduleRequests.status })
    .from(scheduleRequests)
    .where(eq(scheduleRequests.id, id))
    .limit(1);
  if (!request) return "Permintaan tidak ditemukan.";
  if (request.status !== "pending") return "Permintaan ini sudah diproses atau dibatalkan.";

  const mark = (tx: Executor) =>
    tx
      .update(scheduleRequests)
      .set({ status: decision, response, decidedBy: adminId, decidedAt: new Date() })
      .where(and(eq(scheduleRequests.id, id), eq(scheduleRequests.status, "pending")));
  if (decision === "rejected") {
    await mark(db);
    return null;
  }

  const slots = await db
    .select({ id: rondaSchedule.id, day: rondaSchedule.dayOfWeek })
    .from(rondaSchedule)
    .where(eq(rondaSchedule.userId, request.userId));
  const from = request.fromDay === null ? undefined : slots.find((s) => s.day === request.fromDay);
  const alreadyThere = slots.some((s) => s.day === request.toDay);
  const lastPosition = sql`(select coalesce(max(${rondaSchedule.position}), -1) + 1 from ${rondaSchedule} where ${rondaSchedule.dayOfWeek} = ${request.toDay})`;

  if (alreadyThere) {
    // Sudah jaga di malam tujuan (mis. diatur admin lewat editor): cukup lepas malam lamanya.
    await runBatch(db, (tx) => [mark(tx), ...(from ? [tx.delete(rondaSchedule).where(eq(rondaSchedule.id, from.id))] : [])]);
  } else if (from) {
    await runBatch(db, (tx) => [
      mark(tx),
      tx.update(rondaSchedule).set({ dayOfWeek: request.toDay, position: lastPosition }).where(eq(rondaSchedule.id, from.id)),
    ]);
  } else {
    // Rumahnya ikut dari akun petugas.
    await runBatch(db, (tx) => [mark(tx), tx.insert(rondaSchedule).values({ dayOfWeek: request.toDay, position: lastPosition, userId: request.userId, color: NEW_SLOT_COLOR })]);
  }
  return null;
}
