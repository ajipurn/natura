import { getTableName, is, sql, type SQL } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import type { Db } from "./db";
import * as schema from "./schema";

type Relation = { schema: string; name: string };
type DumpTable = Relation & {
  definition: string;
  columns: string[];
  constraints: string[];
  indexes: string[];
  security: string[];
};
type DumpSequence = Relation & { definition: string; ownership: string };
type Catalog = { tables: DumpTable[]; enums: string[]; sequences: DumpSequence[] };

const quoteIdentifier = (value: string) => `"${value.replace(/"/g, '""')}"`;
const relationName = (relation: Relation) => `${quoteIdentifier(relation.schema)}.${quoteIdentifier(relation.name)}`;
const relationSql = (relation: Relation) => sql`${sql.identifier(relation.schema)}.${sql.identifier(relation.name)}`;

/** SQL mandiri untuk struktur dan data aplikasi; dipulihkan ke database kosong tanpa mematikan FK/RLS. */
export async function createSqlDatabaseBackup(db: Db) {
  const relations: Relation[] = [
    ...Object.values(schema).filter((value) => is(value, PgTable)).map((table) => ({ schema: "public", name: getTableName(table) })),
    { schema: "drizzle", name: "__drizzle_migrations" },
  ];
  return db.transaction(async (tx) => {
    // Nama di definisi Postgres harus menyertakan schema; format tanggal tidak mengikuti sesi pengguna.
    await tx.execute(sql`select set_config('search_path', 'pg_catalog', true), set_config('DateStyle', 'ISO, YMD', true), set_config('row_security', 'off', true)`);
    await tx.execute(sql`lock table ${sql.join(relations.map(relationSql), sql`, `)} in access share mode`);
    const { rows: [catalog] } = await tx.execute<Catalog>(sql`
      with app_tables as (
        select c.oid, n.nspname, c.relname, c.relrowsecurity, c.relforcerowsecurity
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where (n.nspname, c.relname) in (${sql.join(relations.map((relation) => sql`(${relation.schema}::text, ${relation.name}::text)`), sql`, `)})
      )
      select
        (select json_agg(json_build_object(
          'schema', t.nspname, 'name', t.relname,
          'columns', (select json_agg(a.attname order by a.attnum) from pg_attribute a where a.attrelid = t.oid and a.attnum > 0 and not a.attisdropped),
          'definition', (select format('CREATE TABLE %I.%I (%s);', t.nspname, t.relname,
            string_agg(format('%I %s%s%s', a.attname, format_type(a.atttypid, a.atttypmod),
              case when d.oid is null then '' else ' DEFAULT ' || pg_get_expr(d.adbin, d.adrelid) end,
              case when a.attnotnull then ' NOT NULL' else '' end), ', ' order by a.attnum))
            from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
            where a.attrelid = t.oid and a.attnum > 0 and not a.attisdropped),
          'constraints', coalesce((select json_agg(format('ALTER TABLE %I.%I ADD CONSTRAINT %I %s;', t.nspname, t.relname, con.conname, pg_get_constraintdef(con.oid)) order by con.conname)
            from pg_constraint con where con.conrelid = t.oid and con.contype <> 'n'), '[]'::json),
          'indexes', coalesce((select json_agg(pg_get_indexdef(i.indexrelid) || ';' order by i.indexrelid)
            from pg_index i where i.indrelid = t.oid and not exists (select 1 from pg_constraint con where con.conindid = i.indexrelid)), '[]'::json),
          'security', json_build_array(
            case when t.relrowsecurity then format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY;', t.nspname, t.relname) else '' end,
            case when t.relforcerowsecurity then format('ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY;', t.nspname, t.relname) else '' end)
        ) order by t.nspname, t.relname) from app_tables t) as tables,
        (select coalesce(json_agg(e.definition order by e.name), '[]'::json) from (
          select t.typname as name, format('CREATE TYPE %I.%I AS ENUM (%s);', n.nspname, t.typname,
            string_agg(quote_literal(e.enumlabel), ', ' order by e.enumsortorder)) as definition
          from pg_type t join pg_namespace n on n.oid = t.typnamespace join pg_enum e on e.enumtypid = t.oid
          where n.nspname = 'public' group by n.nspname, t.typname
        ) e) as enums,
        (select coalesce(json_agg(json_build_object(
          'schema', n.nspname, 'name', c.relname,
          'definition', format('CREATE SEQUENCE %I.%I AS %s INCREMENT BY %s MINVALUE %s MAXVALUE %s START WITH %s CACHE %s %s;',
            n.nspname, c.relname, format_type(s.seqtypid, null), s.seqincrement, s.seqmin, s.seqmax, s.seqstart, s.seqcache,
            case when s.seqcycle then 'CYCLE' else 'NO CYCLE' end),
          'ownership', format('ALTER SEQUENCE %I.%I OWNED BY %I.%I.%I;', n.nspname, c.relname, t.nspname, t.relname, a.attname)
        ) order by n.nspname, c.relname), '[]'::json)
        from pg_sequence s join pg_class c on c.oid = s.seqrelid join pg_namespace n on n.oid = c.relnamespace
        join pg_depend d on d.classid = 'pg_class'::regclass and d.objid = c.oid and d.deptype = 'a'
        join app_tables t on t.oid = d.refobjid join pg_attribute a on a.attrelid = t.oid and a.attnum = d.refobjsubid) as sequences
    `);

    const statements: SQL[] = catalog.tables.map((table) => {
      const prefix = `INSERT INTO ${relationName(table)} (${table.columns.map(quoteIdentifier).join(", ")}) VALUES (`;
      const values = table.columns.map((column) => sql`quote_nullable(backup_row.${sql.identifier(column)})`);
      return sql`select coalesce(string_agg(${prefix}::text || ${sql.join(values, sql` || ', ' || `)} || ');', E'\n'), '') as content
        from ${relationSql(table)} as backup_row`;
    });
    for (const sequence of catalog.sequences) {
      statements.push(sql`select format('SELECT pg_catalog.setval(%L::regclass, %s, %L);', ${relationName(sequence)}::text, last_value::text, is_called::text) as content
        from ${relationSql(sequence)}`);
    }
    const { rows } = await tx.execute<{ content: string }>(sql.join(statements, sql` union all `));
    const createdAt = new Date().toISOString();
    const content = [
      "-- Natura: backup struktur dan data aplikasi",
      `-- Dibuat ${createdAt}. Pulihkan ke database kosong dengan psql -v ON_ERROR_STOP=1 -f <file.sql>.`,
      "BEGIN;",
      "SET LOCAL search_path = pg_catalog;",
      "SET LOCAL standard_conforming_strings = on;",
      "SET LOCAL DateStyle = 'ISO, YMD';",
      "CREATE SCHEMA IF NOT EXISTS public;",
      "CREATE SCHEMA IF NOT EXISTS drizzle;",
      ...catalog.enums,
      ...catalog.sequences.map((sequence) => sequence.definition),
      ...catalog.tables.map((table) => table.definition),
      ...catalog.sequences.map((sequence) => sequence.ownership),
      ...rows.map((row) => row.content),
      // Kunci utama dibuat sebelum FK; FK dipasang setelah data agar relasi keluarga dua arah utuh.
      ...catalog.tables.flatMap((table) => table.constraints.filter((constraint) => !constraint.includes(" FOREIGN KEY "))),
      ...catalog.tables.flatMap((table) => table.indexes),
      ...catalog.tables.flatMap((table) => table.constraints.filter((constraint) => constraint.includes(" FOREIGN KEY "))),
      ...catalog.tables.flatMap((table) => table.security),
      "COMMIT;",
      "",
    ].filter((line) => line !== "").join("\n") + "\n";
    return { createdAt, content };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}
