import { eq } from "drizzle-orm";
import type { Db } from "@/server/db";
import { residents } from "@/server/schema";

/** Fixture akun selalu memiliki satu profil warga, seperti akun yang dibuat melalui API. */
export async function profileForUser(db: Db, userId: number) {
  await db.insert(residents).values({ userId }).onConflictDoNothing({ target: residents.userId });
  const [profile] = await db.select({ id: residents.id }).from(residents).where(eq(residents.userId, userId));
  return profile.id;
}
