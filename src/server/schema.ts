import { sql } from "drizzle-orm";
import type { GeoAnchor } from "@/lib/geo";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

/**
 * Skema Postgres (Supabase di production, PGlite saat development dan tes).
 * RLS dinyalakan tanpa policy: aplikasi konek sebagai pemilik tabel, jadi Data API Supabase
 * (PostgREST) tidak bisa membaca tabel-tabel ini.
 */
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const roleEnum = pgEnum("role", ["admin", "petugas", "ketua", "sekretaris", "bendahara", "humas"]);
/** `vacant` = rumah kosong / penghuni mudik, tidak dihitung sebagai bolong. */
export const houseStatusEnum = pgEnum("house_status", ["active", "vacant"]);
/** `filled` = wadah jimpitan ada isinya, `empty` = kosong. */
export const collectionStatusEnum = pgEnum("collection_status", ["filled", "empty"]);
export const collectionMethodEnum = pgEnum("collection_method", ["scan", "manual"]);
/** `none` = catatan rumah itu dihapus. */
export const logStatusEnum = pgEnum("log_status", ["filled", "empty", "none"]);
/** `koreksi` = diubah admin dari halaman riwayat. */
export const logMethodEnum = pgEnum("log_method", ["scan", "manual", "koreksi"]);
/** Warna sel di tabel jadwal asli; null = putih. */
export const guardColorEnum = pgEnum("guard_color", ["green", "yellow", "orange", "blue"]);
export const requestStatusEnum = pgEnum("request_status", ["pending", "approved", "rejected", "cancelled"]);
/** `in` = pemasukan lain (mis. saldo awal, sumbangan), `out` = pengeluaran. */
export const cashDirectionEnum = pgEnum("cash_direction", ["in", "out"]);

/** Satu baris saja (id = 1). */
export const settings = pgTable("settings", {
  id: integer("id").primaryKey().default(1),
  communityName: text("community_name").notNull(),
  defaultAmount: integer("default_amount").notNull().default(500),
  /** Kode untuk membuka halaman warga. Null = halaman warga belum dibuka untuk umum. */
  wargaCode: text("warga_code"),
  /** Dinaikkan saat kode warga diganti supaya akses lama tidak berlaku lagi. */
  wargaCodeVersion: integer("warga_code_version").notNull().default(1),
  /** Titik acuan kalibrasi denah ↔ GPS, untuk fitur "Lokasi saya" di denah. */
  planAnchors: jsonb("plan_anchors").$type<GeoAnchor[]>(),
  /** Logo lingkungan sebagai data URL PNG/JPEG/WebP (sudah diperkecil di browser). Null = belum ada. */
  logo: text("logo"),
  /** Dinaikkan tiap logo diganti: bagian dari alamat gambarnya, supaya browser boleh menyimpannya lama. */
  logoVersion: integer("logo_version").notNull().default(0),
  /** Token rahasia di link CSV rekap untuk Google Sheets (`/api/ekspor/<token>/rekap.csv`). Null = link mati. */
  exportToken: text("export_token"),
  /** Ringkasan kas (saldo, pemasukan, pengeluaran) tampil di halaman warga. */
  cashPublic: boolean("cash_public").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

/**
 * Akun petugas/admin. Nama akun juga nama warga di rumahnya (`houseId`): rumah yang dihuni petugas
 * tidak menyimpan nama sendiri. Nama boleh kembar asal rumahnya beda.
 */
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  pinHash: text("pin_hash").notNull(),
  role: roleEnum("role").notNull().default("petugas"),
  active: boolean("active").notNull().default(true),
  failedAttempts: integer("failed_attempts").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  /** Dinaikkan saat PIN diganti supaya sesi lama tidak berlaku lagi. */
  sessionVersion: integer("session_version").notNull().default(1),
  /** Rumah tempat petugas tinggal; jadwal jaganya ikut memakai rumah ini. */
  houseId: integer("house_id").references((): AnyPgColumn => houses.id, { onDelete: "set null" }),
  createdAt: createdAt(),
}).enableRLS();

export const houses = pgTable(
  "houses",
  {
    id: serial("id").primaryKey(),
    block: text("block").notNull(),
    number: text("number").notNull(),
    /** Kolom format lama untuk impor/seed; dipindahkan ke residents. Nama utama dibaca lewat houseName. */
    ownerName: text("owner_name"),
    /** Kode acak yang dicetak di QR. */
    token: text("token").notNull().unique(),
    status: houseStatusEnum("status").notNull().default("active"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("houses_block_number_idx").on(t.block, t.number)],
).enableRLS();

/** Satu orang warga. Profil yang terhubung akun mengambil nama dan rumah dari akun tersebut. */
export const residents = pgTable("residents", {
  id: serial("id").primaryKey(),
  name: text("name"),
  houseId: integer("house_id").references(() => houses.id, { onDelete: "set null" }),
  userId: integer("user_id").references(() => users.id, { onDelete: "restrict" }),
  phone: text("phone"),
  familyId: integer("family_id").references((): AnyPgColumn => families.id, { onDelete: "set null" }),
  familyRelation: text("family_relation").$type<"head" | "spouse" | "child" | "parent" | "other">(),
  housingStatus: text("housing_status").$type<"unknown" | "owner" | "tenant" | "family" | "other">().notNull().default("unknown"),
  residentSince: date("resident_since", { mode: "string" }),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("residents_user_idx").on(t.userId),
  index("residents_house_idx").on(t.houseId),
  index("residents_family_idx").on(t.familyId),
  check("residents_housing_status", sql`${t.housingStatus} in ('unknown', 'owner', 'tenant', 'family', 'other')`),
  check("residents_family_relation", sql`${t.familyRelation} is null or ${t.familyRelation} in ('head', 'spouse', 'child', 'parent', 'other')`),
  check("residents_name_source", sql`(${t.userId} is null and ${t.name} is not null and length(trim(${t.name})) > 0) or (${t.userId} is not null and ${t.name} is null and ${t.houseId} is null)`),
]).enableRLS();

export const families = pgTable("families", {
  id: serial("id").primaryKey(),
  headResidentId: integer("head_resident_id").notNull().references((): AnyPgColumn => residents.id, { onDelete: "restrict" }),
  note: text("note"),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("families_head_idx").on(t.headResidentId)]).enableRLS();

export const residenceMoves = pgTable("residence_moves", {
  id: serial("id").primaryKey(),
  residentId: integer("resident_id").notNull().references(() => residents.id, { onDelete: "cascade" }),
  fromHouseId: integer("from_house_id").references(() => houses.id, { onDelete: "set null" }),
  toHouseId: integer("to_house_id").references(() => houses.id, { onDelete: "set null" }),
  date: date("date", { mode: "string" }).notNull(),
  recordedBy: integer("recorded_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
}, (t) => [index("residence_moves_resident_idx").on(t.residentId)]).enableRLS();

/** Satu malam ronda. Jam 00:00–05:59 masih dihitung malam sebelumnya. */
export const patrols = pgTable("patrols", {
  id: serial("id").primaryKey(),
  date: date("date", { mode: "string" }).notNull().unique(),
  createdAt: createdAt(),
}).enableRLS();

export const collections = pgTable(
  "collections",
  {
    id: serial("id").primaryKey(),
    patrolId: integer("patrol_id")
      .notNull()
      .references(() => patrols.id, { onDelete: "cascade" }),
    houseId: integer("house_id")
      .notNull()
      .references(() => houses.id, { onDelete: "restrict" }),
    status: collectionStatusEnum("status").notNull(),
    amount: integer("amount").notNull(),
    method: collectionMethodEnum("method").notNull(),
    collectedBy: integer("collected_by").references(() => users.id, { onDelete: "set null" }),
    /** Waktu dicatat di HP petugas (bisa lebih awal dari waktu sinkron). */
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("collections_patrol_house_idx").on(t.patrolId, t.houseId)],
).enableRLS();

/**
 * Jejak audit setiap catatan jimpitan: siapa yang scan/mencatat, kapan, dan apakah dia dijadwalkan
 * jaga malam itu (dicek saat catatan diterima, jadi tetap benar walau jadwal berubah kemudian).
 * `collections` hanya menyimpan catatan terakhir per rumah; tabel ini menyimpan semuanya.
 */
export const collectionLogs = pgTable(
  "collection_logs",
  {
    id: serial("id").primaryKey(),
    /** Id catatan dari HP (untuk mengabaikan kiriman ulang dari antrean offline). */
    clientId: text("client_id"),
    /** Tanggal malam ronda. */
    date: date("date", { mode: "string" }).notNull(),
    houseId: integer("house_id")
      .notNull()
      .references(() => houses.id, { onDelete: "cascade" }),
    userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
    status: logStatusEnum("status").notNull(),
    amount: integer("amount").notNull(),
    method: logMethodEnum("method").notNull(),
    /** Pencatat dijadwalkan jaga malam itu; null untuk koreksi admin. */
    onDuty: boolean("on_duty"),
    /** Waktu dicatat di HP. */
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("collection_logs_date_idx").on(t.date, t.recordedAt), uniqueIndex("collection_logs_client_idx").on(t.clientId)],
).enableRLS();

/**
 * Jadwal ronda mingguan. `dayOfWeek` = hari malamnya (0 = Ahad/malam Senin … 6 = Sabtu/malam Minggu).
 * Tiap baris menunjuk tepat satu: akun petugas (rumah dan namanya dari akun), rumah tanpa akun
 * (nama dari data rumah), atau nama bebas tanpa akun dan rumah. Tidak ada salinan nama atau blok/nomor.
 */
export const rondaSchedule = pgTable(
  "ronda_schedule",
  {
    id: serial("id").primaryKey(),
    dayOfWeek: integer("day_of_week").notNull(),
    position: integer("position").notNull(),
    userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }),
    houseId: integer("house_id").references(() => houses.id, { onDelete: "cascade" }),
    name: text("name"),
    color: guardColorEnum("color"),
  },
  (t) => [
    index("ronda_schedule_day_idx").on(t.dayOfWeek, t.position),
    check("ronda_schedule_one_source", sql`num_nonnulls(user_id, house_id, name) = 1`),
  ],
).enableRLS();

/** Permintaan pindah atau tukar jadwal mingguan; admin menyetujui atau menolak. */
export const scheduleRequests = pgTable(
  "schedule_requests",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Malam yang mau dilepas (null = belum punya jadwal, minta ditambah). */
    fromDay: integer("from_day"),
    /** Malam yang diinginkan. */
    toDay: integer("to_day").notNull(),
    /** Petugas yang diajak tukar; null = pindah/tambah jadwal satu orang. */
    targetUserId: integer("target_user_id").references(() => users.id, { onDelete: "cascade" }),
    /** Alasan dari petugas. */
    note: text("note"),
    status: requestStatusEnum("status").notNull().default("pending"),
    /** Catatan admin saat menyetujui/menolak. */
    response: text("response"),
    decidedBy: integer("decided_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
  },
  (t) => [
    index("schedule_requests_status_idx").on(t.status, t.createdAt),
    index("schedule_requests_target_idx").on(t.targetUserId),
    check("schedule_requests_swap", sql`target_user_id is null or (from_day is not null and target_user_id <> user_id and from_day <> to_day)`),
  ],
).enableRLS();

/** Pengumuman untuk warga. */
export const announcements = pgTable("announcements", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  /** Disematkan di atas. */
  pinned: boolean("pinned").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

/** Kontak pengurus yang tampil di halaman warga, urut sesuai `position`. */
export const contacts = pgTable("contacts", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  /** Jabatan, mis. "Ketua RT". */
  role: text("role").notNull(),
  phone: text("phone").notNull(),
  position: integer("position").notNull(),
}).enableRLS();

/**
 * Setoran jimpitan ke bendahara: satu per malam ronda (uangnya disetor selesai keliling malam itu),
 * dicatat bendahara/admin. Jumlah yang tercatat petugas malam itu dihitung dari `collections`.
 */
export const cashDeposits = pgTable(
  "cash_deposits",
  {
    id: serial("id").primaryKey(),
    /** Tanggal malam ronda yang uangnya disetor. */
    date: date("date", { mode: "string" }).notNull().unique(),
    amount: integer("amount").notNull(),
    note: text("note"),
    recordedBy: integer("recorded_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("cash_deposits_amount", sql`${t.amount} >= 0`)],
).enableRLS();

/** Kas selain setoran jimpitan: pengeluaran dan pemasukan lain. */
export const cashEntries = pgTable(
  "cash_entries",
  {
    id: serial("id").primaryKey(),
    date: date("date", { mode: "string" }).notNull(),
    direction: cashDirectionEnum("direction").notNull(),
    amount: integer("amount").notNull(),
    description: text("description").notNull(),
    recordedBy: integer("recorded_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("cash_entries_date_idx").on(t.date), check("cash_entries_amount", sql`${t.amount} > 0`)],
).enableRLS();

/** Kesepakatan berlaku sejak tanggal tertentu; perubahan berikutnya tidak menagih periode sebelumnya. */
export const paymentPlans = pgTable("payment_plans", {
  id: serial("id").primaryKey(),
  houseId: integer("house_id").notNull().references(() => houses.id, { onDelete: "cascade" }),
  effectiveFrom: date("effective_from", { mode: "string" }).notNull(),
  cadence: text("cadence").$type<"daily" | "weekly" | "monthly">().notNull(),
  ratePerNight: integer("rate_per_night").notNull(),
  dueTiming: text("due_timing").$type<"start" | "end">().notNull(),
  graceDays: integer("grace_days").notNull().default(0),
  weekStart: integer("week_start").notNull().default(1),
  recordedBy: integer("recorded_by").references(() => users.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("payment_plans_house_date_idx").on(t.houseId, t.effectiveFrom),
  check("payment_plans_values", sql`${t.ratePerNight} > 0 and ${t.graceDays} between 0 and 31 and ${t.weekStart} between 0 and 6 and ${t.cadence} in ('daily', 'weekly', 'monthly') and ${t.dueTiming} in ('start', 'end')`),
]).enableRLS();

/** Satu penerimaan uang untuk rentang tanggal, terpisah dari pemeriksaan wadah saat ronda. */
export const payments = pgTable("jimpitan_payments", {
  id: serial("id").primaryKey(),
  clientId: text("client_id").notNull(),
  houseId: integer("house_id").notNull().references(() => houses.id, { onDelete: "restrict" }),
  receivedDate: date("received_date", { mode: "string" }).notNull(),
  periodStart: date("period_start", { mode: "string" }).notNull(),
  periodEnd: date("period_end", { mode: "string" }).notNull(),
  cadence: text("cadence").$type<"daily" | "weekly" | "monthly">().notNull(),
  /** Rapel harian: tanggal pilihan dan nominalnya, tanpa mengubah catatan pemeriksaan. */
  allocations: jsonb("allocations").$type<[string, number][]>(),
  amount: integer("amount").notNull(),
  receivedBy: text("received_by").$type<"treasurer" | "collector">().notNull(),
  collectorId: integer("collector_id").references(() => users.id, { onDelete: "set null" }),
  note: text("note"),
  recordedBy: integer("recorded_by").references(() => users.id, { onDelete: "set null" }),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("jimpitan_payments_client_idx").on(t.clientId),
  index("jimpitan_payments_house_period_idx").on(t.houseId, t.periodStart, t.periodEnd),
  index("jimpitan_payments_received_idx").on(t.receivedDate),
  check("jimpitan_payments_values", sql`${t.amount} > 0 and ${t.periodEnd} >= ${t.periodStart} and ${t.cadence} in ('daily', 'weekly', 'monthly') and ${t.receivedBy} in ('treasurer', 'collector')`),
  check("jimpitan_payments_allocations", sql`${t.allocations} is null or (${t.cadence} = 'daily' and jsonb_typeof(${t.allocations}) = 'array' and jsonb_array_length(${t.allocations}) > 0)`),
]).enableRLS();

/** Koreksi dan pembatalan tetap meninggalkan catatan sebelumnya, pelaku, dan waktu perubahan. */
export const paymentLogs = pgTable("payment_logs", {
  id: serial("id").primaryKey(),
  paymentId: integer("payment_id").notNull().references(() => payments.id, { onDelete: "restrict" }),
  userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
  action: text("action").$type<"create" | "update" | "cancel">().notNull(),
  payload: jsonb("payload").notNull(),
  createdAt: createdAt(),
}, (t) => [index("payment_logs_payment_idx").on(t.paymentId)]).enableRLS();

/** Iuran lingkungan; nominal tagihan disimpan saat diterbitkan agar perubahan tarif berlaku ke depan. */
export const duesTypes = pgTable("dues_types", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  amount: integer("amount").notNull(),
  cadence: text("cadence").$type<"monthly" | "once">().notNull(),
  startMonth: text("start_month").notNull(),
  dueDay: integer("due_day").notNull().default(10),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
}, (t) => [check("dues_types_values", sql`${t.amount} > 0 and ${t.dueDay} between 1 and 31 and ${t.cadence} in ('monthly', 'once')`)]).enableRLS();

export const duesInvoices = pgTable("dues_invoices", {
  id: serial("id").primaryKey(),
  typeId: integer("type_id").notNull().references(() => duesTypes.id, { onDelete: "restrict" }),
  houseId: integer("house_id").notNull().references(() => houses.id, { onDelete: "restrict" }),
  month: text("month").notNull(),
  amount: integer("amount").notNull(),
  dueDate: date("due_date", { mode: "string" }).notNull(),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  recordedBy: integer("recorded_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("dues_invoices_period_idx").on(t.typeId, t.houseId, t.month), check("dues_invoices_amount", sql`${t.amount} > 0`)]).enableRLS();

export const duesReceipts = pgTable("dues_receipts", {
  id: serial("id").primaryKey(),
  clientId: text("client_id").notNull().unique(),
  invoiceId: integer("invoice_id").notNull().references(() => duesInvoices.id, { onDelete: "restrict" }),
  amount: integer("amount").notNull(),
  date: date("date", { mode: "string" }).notNull(),
  method: text("method").$type<"cash" | "transfer">().notNull(),
  note: text("note"),
  proof: text("proof"),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  recordedBy: integer("recorded_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
}, (t) => [index("dues_receipts_invoice_idx").on(t.invoiceId), index("dues_receipts_date_idx").on(t.date), check("dues_receipts_values", sql`${t.amount} > 0 and ${t.method} in ('cash', 'transfer')`)]).enableRLS();

export const duesLogs = pgTable("dues_logs", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoice_id").notNull().references(() => duesInvoices.id, { onDelete: "restrict" }),
  receiptId: integer("receipt_id").references(() => duesReceipts.id, { onDelete: "restrict" }),
  action: text("action").$type<"issue" | "cancel_invoice" | "receive" | "cancel_receipt">().notNull(),
  amount: integer("amount").notNull(),
  recordedBy: integer("recorded_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
}).enableRLS();

export type User = typeof users.$inferSelect;
export type House = typeof houses.$inferSelect;
export type Collection = typeof collections.$inferSelect;
