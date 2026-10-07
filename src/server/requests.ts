import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { NEW_SLOT_COLOR } from "@/lib/guard-color";
import { runBatch, type Db, type Executor } from "./db";
import { guardDaysByUser } from "./schedule";
import { houses, rondaSchedule, scheduleRequests, users } from "./schema";

const targetUser = alias(users, "target_user");
const targetHouse = alias(houses, "target_house");
const requestColumns = {
  id: scheduleRequests.id,
  userId: scheduleRequests.userId,
  userName: users.name,
  targetUserId: scheduleRequests.targetUserId,
  targetUserName: targetUser.name,
  targetHouse: sql<string | null>`case when ${targetHouse.block} is not null then ${targetHouse.block} || '-' || ${targetHouse.number} end`,
  fromDay: scheduleRequests.fromDay,
  toDay: scheduleRequests.toDay,
  note: scheduleRequests.note,
  status: scheduleRequests.status,
  response: scheduleRequests.response,
  createdAt: scheduleRequests.createdAt,
  decidedAt: scheduleRequests.decidedAt,
};

/** Permintaan milik petugas atau pertukaran yang melibatkannya; yang menunggu dulu. */
export function listOwnRequests(db: Db, userId: number) {
  return db
    .select(requestColumns)
    .from(scheduleRequests)
    .innerJoin(users, eq(users.id, scheduleRequests.userId))
    .leftJoin(targetUser, eq(targetUser.id, scheduleRequests.targetUserId))
    .leftJoin(targetHouse, eq(targetHouse.id, targetUser.houseId))
    .where(or(eq(scheduleRequests.userId, userId), eq(scheduleRequests.targetUserId, userId)))
    .orderBy(sql`${scheduleRequests.status} = 'pending' desc`, desc(scheduleRequests.createdAt))
    .limit(10);
}

/** Semua permintaan untuk admin: yang menunggu dulu, lalu 30 yang terakhir diputuskan. */
export async function listRequestsForAdmin(db: Db) {
  const [rows, days] = await Promise.all([
    db
      .select({
        ...requestColumns,
        block: houses.block,
        number: houses.number,
        decidedBy: sql<string | null>`(select ${users.name} from ${users} where ${users.id} = ${scheduleRequests.decidedBy})`,
      })
      .from(scheduleRequests)
      .innerJoin(users, eq(users.id, scheduleRequests.userId))
      .leftJoin(houses, eq(houses.id, users.houseId))
      .leftJoin(targetUser, eq(targetUser.id, scheduleRequests.targetUserId))
      .leftJoin(targetHouse, eq(targetHouse.id, targetUser.houseId))
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

type RequestInput = { fromDay: number | null; toDay: number; note: string | null; targetUserId?: number | null };

/** Buat permintaan baru. Mengembalikan pesan kesalahan kalau permintaannya tidak masuk akal. */
export async function createRequest(db: Db, userId: number, input: RequestInput): Promise<string | null> {
  const targetUserId = input.targetUserId ?? null;
  if (targetUserId === userId) return "Pilih petugas lain untuk bertukar jadwal.";
  if (targetUserId !== null && input.fromDay === null) return "Pilih malam jagamu yang mau ditukar.";
  return db.transaction(async (tx) => {
    const involved = targetUserId === null ? [userId] : [userId, targetUserId];
    // Kunci akun dalam urutan yang tetap: dua permintaan bersamaan tidak boleh memakai petugas yang sama.
    const accounts = await tx.select({ id: users.id, active: users.active }).from(users)
      .where(inArray(users.id, involved)).orderBy(asc(users.id)).for("update");
    if (accounts.length !== involved.length || accounts.some((u) => !u.active)) return "Petugas tidak ditemukan atau sudah nonaktif.";
    const daysByUser = await guardDaysByUser(tx);
    const days = daysByUser.get(userId) ?? [];
    if (input.fromDay !== null && !days.includes(input.fromDay)) return "Kamu tidak dijadwalkan di malam itu.";
    if (input.fromDay === input.toDay) return "Pilih malam yang berbeda.";
    if (days.includes(input.toDay)) return "Kamu sudah jaga di malam yang dipilih.";
    if (targetUserId !== null) {
      const targetDays = daysByUser.get(targetUserId) ?? [];
      if (!targetDays.includes(input.toDay)) return "Petugas itu tidak dijadwalkan di malam tujuan.";
      if (targetDays.includes(input.fromDay!)) return "Petugas itu sudah jaga di malam yang mau kamu tukar.";
    }
    const [pending] = await tx.select({ userId: scheduleRequests.userId, targetUserId: scheduleRequests.targetUserId })
      .from(scheduleRequests)
      .where(and(eq(scheduleRequests.status, "pending"), or(inArray(scheduleRequests.userId, involved), inArray(scheduleRequests.targetUserId, involved))))
      .limit(1);
    if (pending) {
      return pending.userId === userId || pending.targetUserId === userId
        ? "Masih ada permintaan yang menunggu. Selesaikan dulu sebelum membuat permintaan baru."
        : "Petugas itu masih punya permintaan yang menunggu. Pilih petugas lain.";
    }
    await tx.insert(scheduleRequests).values({ userId, ...input, targetUserId });
    return null;
  });
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
    .select({ userId: scheduleRequests.userId, targetUserId: scheduleRequests.targetUserId, fromDay: scheduleRequests.fromDay, toDay: scheduleRequests.toDay, status: scheduleRequests.status })
    .from(scheduleRequests)
    .where(eq(scheduleRequests.id, id))
    .limit(1);
  if (!request) return "Permintaan tidak ditemukan.";
  if (request.status !== "pending") return "Permintaan ini sudah diproses atau dibatalkan.";
  if (request.targetUserId !== null) return decideSwap(db, id, adminId, decision, response);

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

/** Tukar dua baris beserta posisinya, tetap memakai rujukan akun dan warna masing-masing petugas. */
async function decideSwap(db: Db, id: number, adminId: number, decision: "approved" | "rejected", response: string | null): Promise<string | null> {
  return db.transaction(async (tx) => {
    const [request] = await tx.select().from(scheduleRequests).where(eq(scheduleRequests.id, id)).for("update");
    if (!request || request.status !== "pending") return "Permintaan ini sudah diproses atau dibatalkan.";
    const mark = () => tx.update(scheduleRequests).set({ status: decision, response, decidedBy: adminId, decidedAt: new Date() })
      .where(eq(scheduleRequests.id, id));
    if (decision === "rejected") {
      await mark();
      return null;
    }
    const involved = [request.userId, request.targetUserId!];
    const accounts = await tx.select({ id: users.id, active: users.active }).from(users)
      .where(inArray(users.id, involved)).orderBy(asc(users.id)).for("update");
    if (accounts.length !== 2 || accounts.some((u) => !u.active)) return "Salah satu petugas sudah nonaktif. Tolak permintaan ini.";
    const slots = await tx.select().from(rondaSchedule).where(inArray(rondaSchedule.userId, involved)).orderBy(asc(rondaSchedule.id)).for("update");
    const own = slots.filter((s) => s.userId === request.userId);
    const target = slots.filter((s) => s.userId === request.targetUserId);
    const from = own.filter((s) => s.dayOfWeek === request.fromDay);
    const to = target.filter((s) => s.dayOfWeek === request.toDay);
    if (from.length !== 1 || to.length !== 1 || own.some((s) => s.dayOfWeek === request.toDay) || target.some((s) => s.dayOfWeek === request.fromDay)) {
      return "Jadwal salah satu petugas sudah berubah atau tercatat ganda. Tolak permintaan ini dan ajukan ulang.";
    }
    // Validasi dan kedua perubahan berada dalam transaksi yang sama; pembatalan/keputusan lain menunggu kuncinya.
    await tx.update(rondaSchedule).set({ dayOfWeek: to[0].dayOfWeek, position: to[0].position }).where(eq(rondaSchedule.id, from[0].id));
    await tx.update(rondaSchedule).set({ dayOfWeek: from[0].dayOfWeek, position: from[0].position }).where(eq(rondaSchedule.id, to[0].id));
    await mark();
    return null;
  });
}
