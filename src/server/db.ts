import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "./schema";

export type Db = DrizzleD1Database<typeof schema>;

/** Binding D1 (`env.DB`), atau D1 dari Miniflare saat tes. */
export type D1 = Parameters<typeof drizzle>[0];

/** Drizzle di atas binding D1. Murah dibuat, jadi dibuat per permintaan. */
export function createDb(d1: D1): Db {
  return drizzle(d1, { schema });
}

/** D1 membatasi 100 parameter per query, jadi insert banyak baris dipecah per sekian baris. */
export const MAX_PARAMS = 100;

export function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
}

/** Ukuran potongan untuk insert banyak baris dengan `columns` kolom per baris. */
export function rowsPerInsert(columns: number): number {
  return Math.max(1, Math.floor(MAX_PARAMS / columns));
}
