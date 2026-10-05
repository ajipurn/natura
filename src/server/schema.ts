import { sql } from "drizzle-orm";
import type { GeoAnchor } from "@/lib/geo";
import { check, index, integer, sqliteTable, text, uniqueIndex, type AnySQLiteColumn } from "drizzle-orm/sqlite-core";

/**
 * Skema Cloudflare D1 (SQLite).
 * Nilai bawaan diisi oleh aplikasi ($defaultFn) karena SQLite tidak mengenal DEFAULT saat insert banyak baris.
 */
const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date());

/** Satu baris saja (id = 1). */
export const settings = sqliteTable("settings", {
  id: integer("id").primaryKey().$defaultFn(() => 1),
  communityName: text("community_name").notNull(),
  defaultAmount: integer("default_amount").notNull().$defaultFn(() => 500),
  /** Kode untuk membuka halaman warga. Null = halaman warga belum dibuka untuk umum. */
  wargaCode: text("warga_code"),
  /** Dinaikkan saat kode warga diganti supaya akses lama tidak berlaku lagi. */
  wargaCodeVersion: integer("warga_code_version").notNull().$defaultFn(() => 1),
  /** Titik acuan kalibrasi denah ↔ GPS, untuk fitur "Lokasi saya" di denah. */
  planAnchors: text("plan_anchors", { mode: "json" }).$type<GeoAnchor[]>(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * Akun petugas/admin. Nama akun juga nama warga di rumahnya (`houseId`): rumah yang dihuni petugas
 * tidak menyimpan nama sendiri. Nama boleh kembar asal rumahnya beda.
 */
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  pinHash: text("pin_hash").notNull(),
  role: text("role", { enum: ["admin", "petugas"] })
    .notNull()
    .$defaultFn(() => "petugas"),
  active: integer("active", { mode: "boolean" })
    .notNull()
    .$defaultFn(() => true),
  failedAttempts: integer("failed_attempts")
    .notNull()
    .$defaultFn(() => 0),
  lockedUntil: integer("locked_until", { mode: "timestamp_ms" }),
  /** Dinaikkan saat PIN diganti supaya sesi lama tidak berlaku lagi. */
  sessionVersion: integer("session_version")
    .notNull()
    .$defaultFn(() => 1),
  /** Rumah tempat petugas tinggal; jadwal jaganya ikut memakai rumah ini. */
  houseId: integer("house_id").references((): AnySQLiteColumn => houses.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

export const houses = sqliteTable(
  "houses",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    block: text("block").notNull(),
    number: text("number").notNull(),
    /** Nama KK untuk rumah tanpa akun petugas. Rumah yang dihuni petugas memakai nama akunnya (lihat `houseName`). */
    ownerName: text("owner_name"),
    /** Kode acak yang dicetak di QR. */
    token: text("token").notNull().unique(),
    /** `vacant` = rumah kosong / penghuni mudik, tidak dihitung sebagai bolong. */
    status: text("status", { enum: ["active", "vacant"] })
      .notNull()
      .$defaultFn(() => "active"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("houses_block_number_idx").on(t.block, t.number)],
);

/** Satu malam ronda (YYYY-MM-DD). Jam 00:00–05:59 masih dihitung malam sebelumnya. */
export const patrols = sqliteTable("patrols", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull().unique(),
  createdAt: createdAt(),
});

export const collections = sqliteTable(
  "collections",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    patrolId: integer("patrol_id")
      .notNull()
      .references(() => patrols.id, { onDelete: "cascade" }),
    houseId: integer("house_id")
      .notNull()
      .references(() => houses.id, { onDelete: "restrict" }),
    /** `filled` = wadah jimpitan ada isinya, `empty` = kosong. */
    status: text("status", { enum: ["filled", "empty"] }).notNull(),
    amount: integer("amount").notNull(),
    method: text("method", { enum: ["scan", "manual"] }).notNull(),
    collectedBy: integer("collected_by").references(() => users.id, { onDelete: "set null" }),
    /** Waktu dicatat di HP petugas (bisa lebih awal dari waktu sinkron). */
    recordedAt: integer("recorded_at", { mode: "timestamp_ms" }).notNull(),
    syncedAt: integer("synced_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [uniqueIndex("collections_patrol_house_idx").on(t.patrolId, t.houseId)],
);

/**
 * Jejak audit setiap catatan jimpitan: siapa yang scan/mencatat, kapan, dan apakah dia dijadwalkan
 * jaga malam itu (dicek saat catatan diterima, jadi tetap benar walau jadwal berubah kemudian).
 * `collections` hanya menyimpan catatan terakhir per rumah; tabel ini menyimpan semuanya.
 */
export const collectionLogs = sqliteTable(
  "collection_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    /** Id catatan dari HP (untuk mengabaikan kiriman ulang dari antrean offline). */
    clientId: text("client_id"),
    /** Tanggal malam ronda (YYYY-MM-DD). */
    date: text("date").notNull(),
    houseId: integer("house_id")
      .notNull()
      .references(() => houses.id, { onDelete: "cascade" }),
    userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
    /** `none` = catatan rumah itu dihapus. */
    status: text("status", { enum: ["filled", "empty", "none"] }).notNull(),
    amount: integer("amount").notNull(),
    /** `koreksi` = diubah admin dari halaman riwayat. */
    method: text("method", { enum: ["scan", "manual", "koreksi"] }).notNull(),
    /** Pencatat dijadwalkan jaga malam itu; null untuk koreksi admin. */
    onDuty: integer("on_duty", { mode: "boolean" }),
    /** Waktu dicatat di HP. */
    recordedAt: integer("recorded_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("collection_logs_date_idx").on(t.date, t.recordedAt), uniqueIndex("collection_logs_client_idx").on(t.clientId)],
);

/**
 * Jadwal ronda mingguan. `dayOfWeek` = hari malamnya (0 = Ahad/malam Senin … 6 = Sabtu/malam Minggu).
 * Tiap baris menunjuk tepat satu: akun petugas (rumah dan namanya dari akun), rumah tanpa akun
 * (nama dari data rumah), atau nama bebas tanpa akun dan rumah. Tidak ada salinan nama atau blok/nomor.
 */
export const rondaSchedule = sqliteTable(
  "ronda_schedule",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    dayOfWeek: integer("day_of_week").notNull(),
    position: integer("position").notNull(),
    userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }),
    houseId: integer("house_id").references(() => houses.id, { onDelete: "cascade" }),
    name: text("name"),
    /** Warna sel di tabel jadwal asli; null = putih. */
    color: text("color", { enum: ["green", "yellow", "orange"] }),
  },
  (t) => [
    index("ronda_schedule_day_idx").on(t.dayOfWeek, t.position),
    check("ronda_schedule_one_source", sql`(user_id is not null) + (house_id is not null) + (name is not null) = 1`),
  ],
);

/** Permintaan petugas untuk mengubah malam jaganya; admin menyetujui atau menolak. */
export const scheduleRequests = sqliteTable(
  "schedule_requests",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Malam yang mau dilepas (null = belum punya jadwal, minta ditambah). */
    fromDay: integer("from_day"),
    /** Malam yang diinginkan. */
    toDay: integer("to_day").notNull(),
    /** Alasan dari petugas. */
    note: text("note"),
    status: text("status", { enum: ["pending", "approved", "rejected", "cancelled"] })
      .notNull()
      .$defaultFn(() => "pending"),
    /** Catatan admin saat menyetujui/menolak. */
    response: text("response"),
    decidedBy: integer("decided_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    decidedAt: integer("decided_at", { mode: "timestamp_ms" }),
  },
  (t) => [index("schedule_requests_status_idx").on(t.status, t.createdAt)],
);

/** Pengumuman untuk warga. */
export const announcements = sqliteTable("announcements", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  body: text("body").notNull(),
  /** Disematkan di atas. */
  pinned: integer("pinned", { mode: "boolean" })
    .notNull()
    .$defaultFn(() => false),
  createdAt: createdAt(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/** Kontak pengurus yang tampil di halaman warga, urut sesuai `position`. */
export const contacts = sqliteTable("contacts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  /** Jabatan, mis. "Ketua RT". */
  role: text("role").notNull(),
  phone: text("phone").notNull(),
  position: integer("position").notNull(),
});

export type User = typeof users.$inferSelect;
export type House = typeof houses.$inferSelect;
export type Collection = typeof collections.$inferSelect;
