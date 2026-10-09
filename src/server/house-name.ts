import { sql } from "drizzle-orm";

/**
 * Nama utama sebuah rumah: akun petugas yang tinggal di sana, atau warga pertama yang terhubung.
 * Daftar seluruh penghuni dikelola di Warga. owner_name hanya fallback untuk format impor lama.
 * Dipakai data rumah, denah, jadwal, dan rekap supaya nama tetap satu sumber.
 * Ditulis dengan nama tabel lengkap: Drizzle menulis kolom tanpa nama tabel di query satu tabel,
 * dan di subquery `id` akan terbaca sebagai id akun.
 */
export const houseName = sql<string | null>`coalesce((select string_agg(u."name", ', ' order by u."id") from "users" u where u."house_id" = "houses"."id"), (select r."name" from "residents" r where r."house_id" = "houses"."id" order by r."id" limit 1), "houses"."owner_name")`;
