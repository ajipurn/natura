import { and, count, desc, eq, sql } from "drizzle-orm";
import { scheduleDay, slotHouseLabel } from "@/lib/schedule";
import type { Db } from "./db";
import { houseName } from "./house-name";
import { listSchedule } from "./schedule";
import { collectionLogs, houses, users } from "./schema";

/**
 * Jejak audit satu malam ronda: semua catatan (scan QR, manual, koreksi admin) beserta pencatatnya,
 * ditandai apakah pencatat dijadwalkan jaga malam itu, plus petugas jaga yang belum mencatat apa pun.
 */
export async function getAudit(db: Db, date: string) {
  const day = scheduleDay(date);
  const [logs, schedule] = await Promise.all([
    db
      .select({
        id: collectionLogs.id,
        houseId: collectionLogs.houseId,
        block: houses.block,
        number: houses.number,
        ownerName: houseName,
        userId: collectionLogs.userId,
        userName: users.name,
        status: collectionLogs.status,
        amount: collectionLogs.amount,
        method: collectionLogs.method,
        onDuty: collectionLogs.onDuty,
        recordedAt: collectionLogs.recordedAt,
        createdAt: collectionLogs.createdAt,
      })
      .from(collectionLogs)
      .innerJoin(houses, eq(houses.id, collectionLogs.houseId))
      .leftJoin(users, eq(users.id, collectionLogs.userId))
      .where(eq(collectionLogs.date, date))
      .orderBy(desc(collectionLogs.recordedAt), desc(collectionLogs.id)),
    listSchedule(db),
  ]);

  const byPetugas = logs.filter((l) => l.method !== "koreksi");
  // Pencatat malam itu: jumlah catatannya dan apakah dia dijadwalkan.
  const recorders = new Map<number, { userId: number; name: string; count: number; onDuty: boolean }>();
  for (const l of byPetugas) {
    if (l.userId === null) continue;
    const r = recorders.get(l.userId) ?? { userId: l.userId, name: l.userName ?? "—", count: 0, onDuty: false };
    r.count++;
    r.onDuty ||= Boolean(l.onDuty);
    recorders.set(l.userId, r);
  }
  const guards = schedule
    .filter((s) => s.day === day && s.userId !== null)
    .map((s) => ({
      userId: s.userId!,
      name: s.name ?? "—",
      house: slotHouseLabel(s),
      color: s.color,
      count: recorders.get(s.userId!)?.count ?? 0,
    }));

  return {
    date,
    logs: logs.map(({ recordedAt, createdAt, ...l }) => ({
      ...l,
      recordedAt: recordedAt.toISOString(),
      /** Diterima server; bisa jauh lebih lambat dari waktu catat kalau HP sedang offline. */
      syncedAt: createdAt.toISOString(),
    })),
    /** Pencatat yang tidak dijadwalkan malam itu. */
    offDuty: [...recorders.values()].filter((r) => !r.onDuty),
    /** Petugas yang dijadwalkan malam itu (menurut jadwal sekarang) dan jumlah catatannya. */
    guards,
    counts: {
      total: logs.length,
      scan: logs.filter((l) => l.method === "scan").length,
      offDuty: byPetugas.filter((l) => l.onDuty === false).length,
    },
  };
}

/** Jumlah catatan oleh petugas yang tidak dijadwalkan pada satu malam (untuk Ringkasan). */
export async function countOffDuty(db: Db, date: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(collectionLogs)
    .where(and(eq(collectionLogs.date, date), sql`${collectionLogs.onDuty} = 0`));
  return row?.n ?? 0;
}
