import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { isIsoDate } from "../src/lib/dates";
import { PAYMENT_PLAN_CADENCES } from "../src/lib/payments";
import { newToken } from "../src/lib/qr";
import type { Db } from "../src/server/db";
import { houses, paymentPlans, users } from "../src/server/schema";
import { openTarget } from "./db-target";
import { adoptLegacyResidents, setHouseResident } from "../src/server/residents";
import { houseName } from "../src/server/house-name";

/** Berkas input lokal; daftar warga tidak ikut diterbitkan bersama source aplikasi. */
const sourceSchema = z.object({
  residents: z.array(z.object({
    block: z.string().regex(/^[A-Z]{1,4}$/), number: z.string().min(1).max(10),
    name: z.string().trim().min(1).max(100).optional(), status: z.enum(["active", "vacant"]).optional(),
  })).min(1),
  plans: z.array(z.object({
    house: z.string().min(1), effectiveFrom: z.string().refine(isIsoDate), cadence: z.enum(PAYMENT_PLAN_CADENCES),
    ratePerNight: z.number().int().positive().max(1_000_000), dueTiming: z.enum(["start", "end"]).default("end"),
    graceDays: z.number().int().min(0).max(31).default(0), weekStart: z.number().int().min(0).max(6).default(1),
  })).default([]),
});
export type ResidentSource = z.infer<typeof sourceSchema>;

/** Pembaruan nama mengikuti sumber akun/rumah yang sama dengan aplikasi; tidak mengubah PIN atau malam jaga. */
export async function syncResidents(db: Db, source: ResidentSource) {
  return db.transaction(async (tx) => {
    await adoptLegacyResidents(tx);
    const changed: string[] = [];
    const added: string[] = [];
    const [admin] = await tx.select({ id: users.id }).from(users).where(and(eq(users.role, "admin"), eq(users.active, true))).orderBy(asc(users.id)).limit(1);
    if (!admin) throw new Error("Tidak ada akun admin aktif.");
    for (const resident of source.residents) {
      const label = resident.block + "-" + resident.number;
      let [house] = await tx.select({ id: houses.id, ownerName: houseName, status: houses.status }).from(houses).where(and(eq(houses.block, resident.block), eq(houses.number, resident.number))).for("update");
      if (!house) {
        [house] = await tx.insert(houses).values({ block: resident.block, number: resident.number, status: resident.status ?? "active", token: newToken() }).returning();
        added.push(label);
      }
      const residents = await tx.select({ id: users.id, name: users.name }).from(users).where(eq(users.houseId, house.id)).for("update");
      if (resident.name && residents.length > 1) throw new Error(label + " punya lebih dari satu akun penghuni. Nama perlu dipilih secara manual.");
      const nameChanged = resident.name && (residents.length ? residents[0].name !== resident.name : house.ownerName !== resident.name);
      const statusChanged = resident.status && resident.status !== house.status;
      if (resident.name && residents.length === 1) {
        if (nameChanged) await tx.update(users).set({ name: resident.name }).where(eq(users.id, residents[0].id));
        await tx.update(houses).set({ ownerName: null, ...(resident.status && { status: resident.status }) }).where(eq(houses.id, house.id));
      } else if (resident.name || resident.status) {
        if (resident.name && residents.length === 0) await setHouseResident(tx, house.id, resident.name);
        if (resident.status) await tx.update(houses).set({ status: resident.status }).where(eq(houses.id, house.id));
      }
      if (nameChanged || statusChanged) changed.push(label);
      const plans = source.plans.filter((p) => p.house === label);
      if (plans.length) {
        await tx.insert(paymentPlans).values(plans.map(({ house: _label, ...plan }) => ({ ...plan, houseId: house.id, recordedBy: admin.id })))
          .onConflictDoNothing({ target: [paymentPlans.houseId, paymentPlans.effectiveFrom] });
      }
    }
    return { added, changed, monthly: [...new Set(source.plans.filter((p) => p.cadence === "monthly").map((p) => p.house))] };
  });
}

async function main() {
  if (!process.argv.includes("--remote")) throw new Error("Pembaruan ini khusus remote. Pakai --remote, dan --apply untuk menyimpan.");
  const sourceIndex = process.argv.indexOf("--source");
  const sourcePath = sourceIndex >= 0 ? process.argv[sourceIndex + 1] : undefined;
  if (!sourcePath || sourcePath.startsWith("--")) throw new Error("Pilih berkas input JSON lokal dengan --source /path/warga.json.");
  const source = sourceSchema.parse(JSON.parse(readFileSync(sourcePath, "utf8")));
  const target = await openTarget(true);
  try {
    if (!process.argv.includes("--apply")) {
      const existing = await target.db.select({ block: houses.block, number: houses.number }).from(houses);
      const keys = new Set(existing.map((h) => h.block + "-" + h.number));
      console.log(JSON.stringify({ sourceRows: source.residents.length, newHouses: source.residents.filter((r) => !keys.has(r.block + "-" + r.number)).map((r) => r.block + "-" + r.number), plans: source.plans.length }, null, 2));
      return;
    }
    const backupDir = path.join(process.env.HOME!, ".codex", "backups", "natura");
    mkdirSync(backupDir, { recursive: true, mode: 0o700 });
    const backupPath = path.join(backupDir, "before-residents-" + new Date().toISOString().replace(/[:.]/g, "-") + ".json");
    const snapshot = await target.db.transaction(async (tx) => ({ houses: await tx.select().from(houses), users: await tx.select().from(users), paymentPlans: await tx.select().from(paymentPlans) }));
    writeFileSync(backupPath, JSON.stringify(snapshot, null, 2), { mode: 0o600 });
    const result = await syncResidents(target.db, source);
    console.log(JSON.stringify({ backupPath, ...result }, null, 2));
  } finally { await target.close(); }
}

if (import.meta.main) main().catch((error) => { console.error(error instanceof Error ? error.message : "Pembaruan gagal."); process.exitCode = 1; });
