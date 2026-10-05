import { and, asc, desc, eq, ne, sql } from "drizzle-orm";
import { Hono } from "hono";
import { validator } from "hono/validator";
import { z } from "zod";
import { isIsoDate, rondaDate } from "@/lib/dates";
import { normalizeHouseField, parseNumberList } from "@/lib/houses";
import { newToken } from "@/lib/qr";
import { GUARD_COLORS } from "@/lib/guard-color";
import { parseSchedule } from "@/lib/schedule";
import { matchPlan } from "@/lib/site-plan";
import { SITE_PLAN } from "@/site-plan";
import { requireAdmin } from "../auth";
import { MAX_AMOUNT, writeCollection } from "../collections";
import { chunk, rowsPerInsert, runBatch } from "../db";
import type { AppEnv } from "../env";
import { body, idParam, pinField, trimmed } from "../http";
import { hashPin } from "../pin";
import { getHouseIds, getSettings, listHouses, listHousesWithUsage, listUsers } from "../queries";
import { countPendingRequests, decideRequest, listRequestsForAdmin } from "../requests";
import { clearSchedule, replaceSlots, saveSchedule, userDaysStatements } from "../schedule";
import { announcements, collections, contacts, houses, rondaSchedule, settings, users } from "../schema";
import { getDashboard } from "../dashboard";

const BLOCK_PATTERN = /^[0-9A-Z][0-9A-Z .\-/]{0,9}$/;
const NUMBER_PATTERN = /^[0-9A-Z][0-9A-Z\-/]{0,9}$/;
const ownerName = z
  .string()
  .trim()
  .transform((v) => v.slice(0, 80) || null)
  .nullable()
  .optional()
  .transform((v) => v ?? null);

const addHousesSchema = z.object({
  block: z.string().transform(normalizeHouseField).pipe(z.string().regex(BLOCK_PATTERN, "Blok wajib diisi (huruf/angka, maks. 10 karakter).")),
  numbers: z.string().max(500),
  ownerName,
});

const updateHouseSchema = z.object({
  block: z.string().transform(normalizeHouseField).pipe(z.string().regex(BLOCK_PATTERN, "Blok/nomor tidak valid.")),
  number: z.string().transform(normalizeHouseField).pipe(z.string().regex(NUMBER_PATTERN, "Blok/nomor tidak valid.")),
  ownerName,
  status: z.enum(["active", "vacant"], "Status tidak valid."),
});

const userName = trimmed(40, "Isi nama (maks. 40 karakter).").min(1, "Isi nama (maks. 40 karakter).");
const role = z.enum(["admin", "petugas"]).catch("petugas");
const day = z.number().int().min(0).max(6);
/** Rumah dan malam jaga petugas. */
const guardFields = {
  houseId: z.number().int().positive().nullable().default(null),
  days: z.array(day).max(7).default([]),
};

const guardColor = z.enum(GUARD_COLORS).nullable();

const slotSchema = z.object({
  day,
  color: guardColor.default(null),
  name: z.string().trim().max(60).nullable().transform((v) => v || null),
  block: z.string().transform(normalizeHouseField).pipe(z.string().regex(/^$|^[0-9A-Z][0-9A-Z .\-/]{0,9}$/, "Blok tidak valid.")),
  number: z.string().transform(normalizeHouseField).pipe(z.string().regex(/^$|^[0-9A-Z][0-9A-Z\-/]{0,9}$/, "Nomor rumah tidak valid.")),
  userId: z.number().int().positive().nullable(),
});

const settingsSchema = z.object({
  communityName: trimmed(80, "Isi nama lingkungan (maks. 80 karakter).").min(1, "Isi nama lingkungan (maks. 80 karakter)."),
  defaultAmount: z.number("Nominal jimpitan tidak valid.").int().positive("Nominal jimpitan tidak valid.").max(MAX_AMOUNT, "Nominal jimpitan tidak valid."),
});

const announcementSchema = z.object({
  title: trimmed(120, "Isi judul (maks. 120 karakter).").min(1, "Isi judul (maks. 120 karakter)."),
  body: trimmed(4000, "Isi pengumuman maks. 4000 karakter."),
  pinned: z.boolean().default(false),
});

const contactsSchema = z.object({
  contacts: z
    .array(
      z.object({
        name: trimmed(60, "Isi nama kontak (maks. 60 karakter).").min(1, "Isi nama kontak (maks. 60 karakter)."),
        role: trimmed(60, "Jabatan maks. 60 karakter."),
        phone: trimmed(20, "Nomor HP tidak valid.").regex(/^\+?[0-9 -]{6,20}$/, "Nomor HP tidak valid."),
      }),
    )
    .max(20, "Maksimal 20 kontak."),
});

const MAX_SCHEDULE_TEXT = 50_000;
const MAX_SCHEDULE_ENTRIES = 1000;

/** Alamat publik aplikasi untuk QR. Set APP_URL supaya QR tidak bergantung pada alamat yang dipakai admin. */
function appOrigin(c: { env: AppEnv["Bindings"]; req: { url: string } }) {
  const fromEnv = c.env.APP_URL?.trim();
  return fromEnv ? { origin: fromEnv.replace(/\/+$/, ""), fromEnv: true } : { origin: new URL(c.req.url).origin, fromEnv: false };
}

/** Kode warga: huruf/angka yang mudah dibaca, tanpa 0/O dan 1/I/L. */
function newWargaCode() {
  return newToken().slice(0, 8);
}

export const adminRoutes = new Hono<AppEnv>()
  .use(requireAdmin)

  .get("/ringkasan", async (c) => c.json(await getDashboard(c.var.db, new Date())))

  /* ---------- Rumah ---------- */

  .get("/rumah", async (c) => {
    const db = c.var.db;
    const [list, settingsRow] = await Promise.all([listHousesWithUsage(db), getSettings(db)]);
    return c.json({ houses: list, communityName: settingsRow.communityName, ...appOrigin(c) });
  })

  /** Tambah satu rumah atau banyak sekaligus ("1-20", "1, 3, 5"). */
  .post("/rumah", body(addHousesSchema), async (c) => {
    const { block, numbers: raw } = c.req.valid("json");
    const numbers = parseNumberList(raw);
    if (!numbers || numbers.some((n) => !NUMBER_PATTERN.test(n))) {
      return c.json({ error: "Format nomor salah. Contoh: 12, atau 1-20, atau 1, 3, 5A." }, 400);
    }
    const db = c.var.db;
    // Nama KK hanya dipakai kalau menambah satu rumah.
    const name = numbers.length === 1 ? c.req.valid("json").ownerName : null;
    let inserted = 0;
    for (const part of chunk(numbers, rowsPerInsert(6))) {
      const rows = await db
        .insert(houses)
        .values(part.map((number) => ({ block, number, ownerName: name, token: newToken() })))
        .onConflictDoNothing({ target: [houses.block, houses.number] })
        .returning({ id: houses.id });
      inserted += rows.length;
    }
    if (inserted === 0) return c.json({ error: `Semua nomor di blok ${block} sudah terdaftar.` }, 409);
    const skipped = numbers.length - inserted;
    return c.json({ success: `${inserted} rumah ditambahkan ke blok ${block}.${skipped ? ` ${skipped} sudah ada, dilewati.` : ""}` });
  })

  .patch("/rumah/:id", idParam(), body(updateHouseSchema), async (c) => {
    const { id } = c.req.valid("param");
    const { block, number, ownerName: name, status } = c.req.valid("json");
    const db = c.var.db;
    const [duplicate] = await db
      .select({ id: houses.id })
      .from(houses)
      .where(and(eq(houses.block, block), eq(houses.number, number), ne(houses.id, id)))
      .limit(1);
    if (duplicate) return c.json({ error: `Rumah ${block}-${number} sudah ada.` }, 409);
    await db.update(houses).set({ block, number, ownerName: name, status }).where(eq(houses.id, id));
    return c.json({ success: "Tersimpan." });
  })

  /** Buat kode QR baru (mis. stiker hilang/rusak). Stiker lama tidak berlaku lagi. */
  .post("/rumah/:id/token", idParam(), async (c) => {
    await c.var.db.update(houses).set({ token: newToken() }).where(eq(houses.id, c.req.valid("param").id));
    return c.json({ success: "QR baru dibuat. Cetak ulang stiker rumah ini." });
  })

  .delete("/rumah/:id", idParam(), async (c) => {
    const { id } = c.req.valid("param");
    const db = c.var.db;
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(collections)
      .where(eq(collections.houseId, id));
    if (count > 0) {
      return c.json({ error: "Rumah ini sudah punya catatan jimpitan. Tandai sebagai kosong/mudik saja." }, 409);
    }
    await db.delete(houses).where(eq(houses.id, id));
    return c.json({ success: "Rumah dihapus." });
  })

  /** Daftarkan semua kavling berpenghuni di denah yang belum punya data rumah. */
  .post("/rumah/dari-denah", async (c) => {
    const db = c.var.db;
    const { missing } = matchPlan(SITE_PLAN, await listHouses(db));
    if (missing.length === 0) return c.json({ success: "Semua rumah di denah sudah terdaftar." });
    let inserted = 0;
    for (const part of chunk(missing, rowsPerInsert(6))) {
      const rows = await db
        .insert(houses)
        .values(part.map((lot) => ({ block: lot.block, number: lot.number!, token: newToken() })))
        .onConflictDoNothing({ target: [houses.block, houses.number] })
        .returning({ id: houses.id });
      inserted += rows.length;
    }
    return c.json({ success: `${inserted} rumah didaftarkan dari denah. Jangan lupa cetak stiker QR-nya.` });
  })

  /* ---------- Petugas ---------- */

  .get("/petugas", async (c) => c.json({ users: await listUsers(c.var.db), me: c.var.user }))

  .post("/petugas", body(z.object({ name: userName, pin: pinField(), role, ...guardFields })), async (c) => {
    const { name, pin, role: newRole, houseId, days } = c.req.valid("json");
    const db = c.var.db;
    if (await nameTaken(db, name)) return c.json({ error: `Nama "${name}" sudah dipakai.` }, 409);
    const house = await houseById(db, houseId);
    if (houseId && !house) return c.json({ error: "Rumah tidak ditemukan." }, 404);
    const [user] = await db
      .insert(users)
      .values({ name, pinHash: await hashPin(pin), role: newRole, houseId })
      .returning({ id: users.id });
    await runBatch(db, userDaysStatements(db, user.id, days, house, []));
    return c.json({ success: `${name} ditambahkan. Beri tahu PIN-nya secara langsung.`, id: user.id });
  })

  .patch(
    "/petugas/:id",
    idParam(),
    body(z.object({ name: userName, role, active: z.boolean(), ...guardFields })),
    async (c) => {
      const { id } = c.req.valid("param");
      const { name, role: newRole, active, houseId, days } = c.req.valid("json");
      const db = c.var.db;
      if (await nameTaken(db, name, id)) return c.json({ error: `Nama "${name}" sudah dipakai.` }, 409);
      if (id === c.var.user.id && (!active || newRole !== "admin")) {
        return c.json({ error: "Tidak bisa menonaktifkan atau menurunkan peran akunmu sendiri." }, 400);
      }
      const house = await houseById(db, houseId);
      if (houseId && !house) return c.json({ error: "Rumah tidak ditemukan." }, 404);
      const current = await db
        .selectDistinct({ day: rondaSchedule.dayOfWeek })
        .from(rondaSchedule)
        .where(eq(rondaSchedule.userId, id));
      await runBatch(db, [
        db.update(users).set({ name, role: newRole, active, houseId }).where(eq(users.id, id)),
        ...userDaysStatements(db, id, days, house, current.map((r) => r.day)),
      ]);
      return c.json({ success: "Tersimpan." });
    },
  )

  .post("/petugas/:id/pin", idParam(), body(z.object({ pin: pinField() })), async (c) => {
    await c.var.db
      .update(users)
      .set({
        pinHash: await hashPin(c.req.valid("json").pin),
        failedAttempts: 0,
        lockedUntil: null,
        // Keluarkan sesi lama di semua HP.
        sessionVersion: sql`${users.sessionVersion} + 1`,
      })
      .where(eq(users.id, c.req.valid("param").id));
    return c.json({ success: "PIN diatur ulang. Petugas perlu masuk lagi dengan PIN baru." });
  })

  /* ---------- Pengaturan & kode warga ---------- */

  .get("/pengaturan", async (c) => {
    const [row] = await c.var.db
      .select({ communityName: settings.communityName, defaultAmount: settings.defaultAmount, wargaCode: settings.wargaCode })
      .from(settings)
      .where(eq(settings.id, 1))
      .limit(1);
    return c.json({ ...(row ?? { communityName: "", defaultAmount: 500, wargaCode: null }), ...appOrigin(c) });
  })

  .put("/pengaturan", body(settingsSchema), async (c) => {
    const values = c.req.valid("json");
    await c.var.db
      .insert(settings)
      .values({ id: 1, ...values })
      .onConflictDoUpdate({ target: settings.id, set: { ...values, updatedAt: new Date() } });
    return c.json({ success: "Pengaturan disimpan." });
  })

  /** Buat kode warga baru (kode lama tidak berlaku lagi) atau tutup halaman warga. */
  .post("/pengaturan/kode-warga", body(z.object({ enabled: z.boolean() })), async (c) => {
    const code = c.req.valid("json").enabled ? newWargaCode() : null;
    await c.var.db
      .update(settings)
      .set({ wargaCode: code, wargaCodeVersion: sql`${settings.wargaCodeVersion} + 1`, updatedAt: new Date() })
      .where(eq(settings.id, 1));
    return c.json({ wargaCode: code });
  })

  /* ---------- Jadwal ronda ---------- */

  .put(
    "/jadwal",
    // Teks tidak dipangkas: sel kosong di awal baris judul tabel menentukan posisi kolom hari.
    body(
      z.object({
        text: z.string().max(MAX_SCHEDULE_TEXT, "Teks jadwal terlalu panjang."),
        fillNames: z.boolean(),
        overwriteNames: z.boolean(),
        /** Warna sel tiap baris jadwal (urutan sama dengan hasil baca teks), dari tabel yang ditempel. */
        colors: z.array(guardColor).max(MAX_SCHEDULE_ENTRIES).optional(),
      }),
    ),
    async (c) => {
      const { text, fillNames, overwriteNames, colors } = c.req.valid("json");
      if (!text.trim()) return c.json({ error: "Tempel jadwalnya dulu." }, 400);
      const { entries } = parseSchedule(text);
      if (entries.length === 0) {
        return c.json({ error: "Tidak ada jadwal yang terbaca. Pastikan ada nama hari dan kode rumah seperti (AD-3)." }, 400);
      }
      if (entries.length > MAX_SCHEDULE_ENTRIES) return c.json({ error: "Jadwal terlalu banyak barisnya." }, 400);

      // Warna hanya dipakai kalau jumlahnya cocok dengan jadwal yang terbaca.
      const withColors = colors?.length === entries.length ? entries.map((e, i) => ({ ...e, color: colors[i] })) : entries;
      const summary = await saveSchedule(c.var.db, withColors, { fillNames, overwriteNames });
      const parts = [`${summary.saved} baris jadwal tersimpan untuk ${summary.days} malam.`];
      if (summary.linked) parts.push(`${summary.linked} terhubung ke akun petugas.`);
      if (fillNames) parts.push(`${summary.namesFilled} nama KK diisi.`);
      if (summary.unknown.length) parts.push(`Belum ada di data rumah: ${summary.unknown.join(", ")}.`);
      if (summary.conflicting.length) parts.push(`Nama ganda, tidak diisi: ${summary.conflicting.join("; ")}.`);
      return c.json({ success: parts.join(" ") });
    },
  )

  /** Simpan seluruh jadwal hasil edit (urutan per malam mengikuti urutan daftar). */
  .put("/jadwal/slot", body(z.object({ slots: z.array(slotSchema).max(MAX_SCHEDULE_ENTRIES, "Jadwal terlalu banyak barisnya.") })), async (c) => {
    const slots = c.req.valid("json").slots;
    if (slots.some((s) => !s.userId && !s.name && !s.block)) return c.json({ error: "Ada baris jadwal tanpa nama dan rumah." }, 400);
    const unknown = await replaceSlots(c.var.db, slots);
    if (unknown.length) return c.json({ error: "Ada petugas yang sudah tidak ada. Muat ulang halaman lalu coba lagi." }, 409);
    return c.json({ success: `Jadwal disimpan (${slots.length} baris).` });
  })

  /* ---------- Permintaan ubah jadwal dari petugas ---------- */

  .get("/permintaan", async (c) => {
    const db = c.var.db;
    const [requests, pending] = await Promise.all([listRequestsForAdmin(db), countPendingRequests(db)]);
    return c.json({ requests, pending });
  })

  .post(
    "/permintaan/:id/:keputusan",
    validator("param", (value: Record<string, string>, c) => {
      const id = Number(value.id);
      const keputusan = value.keputusan;
      if (!Number.isSafeInteger(id) || id <= 0 || (keputusan !== "setujui" && keputusan !== "tolak")) {
        return c.json({ error: "Data tidak valid." }, 400);
      }
      return { id: value.id, keputusan: keputusan as "setujui" | "tolak" };
    }),
    body(z.object({ response: z.string().trim().max(300, "Catatan maks. 300 karakter.").transform((v) => v || null) })),
    async (c) => {
      const { id, keputusan } = c.req.valid("param");
      const decision = keputusan === "setujui" ? "approved" : "rejected";
      const error = await decideRequest(c.var.db, Number(id), c.var.user.id, decision, c.req.valid("json").response);
      if (error) return c.json({ error }, 409);
      return c.json({ success: decision === "approved" ? "Disetujui; jadwal sudah diubah." : "Permintaan ditolak." });
    },
  )

  .delete("/jadwal", async (c) => {
    await clearSchedule(c.var.db);
    return c.json({ success: "Jadwal dihapus." });
  })

  /* ---------- Koreksi catatan ---------- */

  .put(
    "/riwayat/:date/:houseId",
    validator("param", (value: Record<string, string>, c) => {
      const houseId = Number(value.houseId);
      if (!isIsoDate(value.date) || !Number.isSafeInteger(houseId) || houseId <= 0) return c.json({ error: "Data tidak valid." }, 400);
      return { date: value.date, houseId };
    }),
    body(z.object({ status: z.enum(["filled", "empty", "none"], "Status tidak valid."), amount: z.number().int().min(0).max(MAX_AMOUNT) })),
    async (c) => {
      const { date, houseId } = c.req.valid("param");
      const { status, amount } = c.req.valid("json");
      if (status === "filled" && amount <= 0) return c.json({ error: "Isi nominal yang benar." }, 400);
      if (date > rondaDate(new Date())) return c.json({ error: "Tanggalnya belum lewat." }, 400);
      if (!(await getHouseIds(c.var.db)).has(houseId)) return c.json({ error: "Rumah tidak ditemukan." }, 404);
      await writeCollection(c.var.db, { date, houseId, status, amount, method: "manual", userId: c.var.user.id, recordedAt: new Date() });
      return c.json({ success: "Tersimpan." });
    },
  )

  /* ---------- Info warga: pengumuman & kontak ---------- */

  .get("/info", async (c) => {
    const db = c.var.db;
    const [announcementRows, contactRows] = await Promise.all([
      db.select().from(announcements).orderBy(desc(announcements.pinned), desc(announcements.createdAt)),
      db.select().from(contacts).orderBy(asc(contacts.position)),
    ]);
    return c.json({ announcements: announcementRows, contacts: contactRows });
  })

  .post("/pengumuman", body(announcementSchema), async (c) => {
    await c.var.db.insert(announcements).values(c.req.valid("json"));
    return c.json({ success: "Pengumuman diterbitkan." });
  })

  .patch("/pengumuman/:id", idParam(), body(announcementSchema), async (c) => {
    await c.var.db
      .update(announcements)
      .set({ ...c.req.valid("json"), updatedAt: new Date() })
      .where(eq(announcements.id, c.req.valid("param").id));
    return c.json({ success: "Pengumuman disimpan." });
  })

  .delete("/pengumuman/:id", idParam(), async (c) => {
    await c.var.db.delete(announcements).where(eq(announcements.id, c.req.valid("param").id));
    return c.json({ success: "Pengumuman dihapus." });
  })

  /** Simpan seluruh daftar kontak sekaligus (urutannya ikut urutan di daftar). */
  .put("/kontak", body(contactsSchema), async (c) => {
    const db = c.var.db;
    const list = c.req.valid("json").contacts;
    await runBatch(db, [
      db.delete(contacts),
      ...chunk(list, rowsPerInsert(4)).map((part, p) =>
        db.insert(contacts).values(part.map((ct, i) => ({ ...ct, position: p * rowsPerInsert(4) + i }))),
      ),
    ]);
    return c.json({ success: "Kontak disimpan." });
  });

async function houseById(db: AppEnv["Variables"]["db"], id: number | null) {
  if (!id) return null;
  const [house] = await db.select({ block: houses.block, number: houses.number }).from(houses).where(eq(houses.id, id)).limit(1);
  return house ?? null;
}

async function nameTaken(db: AppEnv["Variables"]["db"], name: string, exceptId?: number) {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(exceptId ? and(sql`lower(${users.name}) = lower(${name})`, ne(users.id, exceptId)) : sql`lower(${users.name}) = lower(${name})`)
    .limit(1);
  return rows.length > 0;
}

