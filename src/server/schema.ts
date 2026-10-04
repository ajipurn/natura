import {
  boolean,
  date,
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["admin", "petugas"]);
/** `vacant` = rumah kosong / penghuni mudik, tidak dihitung sebagai bolong. */
export const houseStatusEnum = pgEnum("house_status", ["active", "vacant"]);
/** `filled` = wadah jimpitan ada isinya, `empty` = kosong. */
export const collectionStatusEnum = pgEnum("collection_status", [
  "filled",
  "empty",
]);
export const collectionMethodEnum = pgEnum("collection_method", [
  "scan",
  "manual",
]);

/** Satu baris saja (id = 1). */
export const settings = pgTable("settings", {
  id: integer("id").primaryKey().default(1),
  communityName: text("community_name").notNull(),
  defaultAmount: integer("default_amount").notNull().default(500),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  pinHash: text("pin_hash").notNull(),
  role: roleEnum("role").notNull().default("petugas"),
  active: boolean("active").notNull().default(true),
  failedAttempts: integer("failed_attempts").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  /** Dinaikkan saat PIN diganti supaya sesi lama tidak berlaku lagi. */
  sessionVersion: integer("session_version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const houses = pgTable(
  "houses",
  {
    id: serial("id").primaryKey(),
    block: text("block").notNull(),
    number: text("number").notNull(),
    ownerName: text("owner_name"),
    /** Kode acak yang dicetak di QR. */
    token: text("token").notNull().unique(),
    status: houseStatusEnum("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("houses_block_number_idx").on(t.block, t.number)],
);

/** Satu malam ronda. Jam 00:00–11:59 masih dihitung malam sebelumnya. */
export const patrols = pgTable("patrols", {
  id: serial("id").primaryKey(),
  date: date("date", { mode: "string" }).notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

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
    amount: integer("amount").notNull().default(0),
    method: collectionMethodEnum("method").notNull(),
    collectedBy: integer("collected_by").references(() => users.id, {
      onDelete: "set null",
    }),
    /** Waktu dicatat di HP petugas (bisa lebih awal dari waktu sinkron). */
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
    syncedAt: timestamp("synced_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("collections_patrol_house_idx").on(t.patrolId, t.houseId),
  ],
);

export type User = typeof users.$inferSelect;
export type House = typeof houses.$inferSelect;
export type Collection = typeof collections.$inferSelect;
export type Settings = typeof settings.$inferSelect;
