import { getTableName, is, sql } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import type { Db } from "./db";
import * as schema from "./schema";

export type DatabaseBackup = {
  format: "natura-database-backup";
  version: 1;
  createdAt: string;
  schema: "public";
  migrations: { id: number; hash: string; created_at: string }[];
  tables: Record<string, Record<string, unknown>[]>;
};

/** Satu SELECT memberi snapshot yang sama untuk seluruh tabel, termasuk tabel baru di schema. */
export async function createDatabaseBackup(db: Db): Promise<DatabaseBackup> {
  const entries = Object.values(schema).filter((value) => is(value, PgTable)).flatMap((table) => [
    sql`${getTableName(table)}::text`,
    // JSON dibentuk di Postgres agar nama kolom asli dan presisi timestamp tetap utuh.
    sql`coalesce((select json_agg(backup_row) from ${table} as backup_row), '[]'::json)`,
  ]);
  const { rows } = await db.execute<{ tables: DatabaseBackup["tables"]; migrations: DatabaseBackup["migrations"] }>(sql`
    select json_build_object(${sql.join(entries, sql`, `)}) as tables,
      (select coalesce(json_agg(migration order by migration.id), '[]'::json)
       from (select id, hash, created_at::text from drizzle.__drizzle_migrations) as migration) as migrations
  `);
  return {
    format: "natura-database-backup",
    version: 1,
    createdAt: new Date().toISOString(),
    schema: "public",
    migrations: rows[0].migrations,
    tables: rows[0].tables,
  };
}
