import { readFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { expect, it } from "vitest";
import { createTestEnv } from "./helpers/db";
import { houses, residents, users } from "@/server/schema";

it("migrasi jadwal mengganti rujukan akun dengan profil yang sama, tanpa menebak identitas dari rumah", async () => {
  const { db } = await createTestEnv();
  // Bentuk lama hanya dibuat di database tes yang terisolasi.
  await db.execute(sql`alter table ronda_schedule drop constraint ronda_schedule_one_source`);
  await db.execute(sql`alter table ronda_schedule drop column resident_id`);
  await db.execute(sql`alter table ronda_schedule add column user_id integer`);
  await db.execute(sql`alter table ronda_schedule add constraint ronda_schedule_user_id_users_id_fk foreign key (user_id) references users(id) on delete cascade`);
  await db.execute(sql`alter table ronda_schedule add constraint ronda_schedule_one_source check (num_nonnulls(user_id, house_id, name) = 1)`);
  const [home] = await db.insert(houses).values({ block: "AF", number: "4", token: "MIGRATIONAF4" }).returning();
  const accounts = await db.insert(users).values([
    { id: 11, name: "Ipung", pinHash: "existing-pin", houseId: home.id },
    { id: 12, name: "Akun tanpa profil", pinHash: "other-pin" },
  ]).returning();
  await db.insert(residents).values({ id: 205, userId: 11, phone: "081234567890" });
  await db.execute(sql`insert into ronda_schedule (id, day_of_week, position, user_id, house_id, name, color) values
    (41, 1, 2, 11, null, null, 'orange'), (42, 2, 0, 12, null, null, 'green'),
    (43, 3, 0, null, ${home.id}, null, 'yellow'), (44, 4, 0, null, null, 'Satpam', 'blue')`);
  const migration = readFileSync(new URL("../drizzle/0012_resident_ronda.sql", import.meta.url), "utf8");
  await db.transaction(async (tx) => {
    for (const statement of migration.split("--> statement-breakpoint")) await tx.execute(sql.raw(statement));
  });
  const rows = (await db.execute(sql`select id, resident_id, house_id, name, day_of_week, position, color from ronda_schedule order by id`)).rows;
  expect(rows[0]).toEqual({ id: 41, resident_id: 205, house_id: null, name: null, day_of_week: 1, position: 2, color: "orange" });
  const profile = (await db.select().from(residents)).find((r) => r.userId === 12)!;
  expect(rows[1]).toMatchObject({ id: 42, resident_id: profile.id, day_of_week: 2, color: "green" });
  expect(rows[2]).toMatchObject({ id: 43, resident_id: null, house_id: home.id, color: "yellow" });
  expect(rows[3]).toMatchObject({ id: 44, resident_id: null, name: "Satpam", color: "blue" });
  expect(await db.select().from(users)).toEqual(accounts);
  expect((await db.select().from(residents)).find((r) => r.id === 205)).toMatchObject({ userId: 11, phone: "081234567890" });
  await expect(db.execute(sql`delete from residents where id = 205`)).rejects.toThrow();
  await expect(db.execute(sql`insert into ronda_schedule (day_of_week, position, resident_id, house_id) values (1, 9, 205, ${home.id})`)).rejects.toThrow();
  expect((await db.execute(sql`select relrowsecurity as enabled from pg_class where relname = 'ronda_schedule'`)).rows[0].enabled).toBe(true);
}, 15_000);
