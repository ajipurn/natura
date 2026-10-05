import { sql } from "drizzle-orm";

/**
 * Nama warga sebuah rumah: nama akun petugas yang tinggal di sana, atau nama KK di data rumah untuk
 * rumah tanpa akun. Dipakai semua layar (data rumah, denah, jadwal, rekap) supaya namanya satu sumber.
 * Ditulis dengan nama tabel lengkap: Drizzle menulis kolom tanpa nama tabel di query satu tabel,
 * dan di subquery `id` akan terbaca sebagai id akun.
 */
export const houseName = sql<string | null>`coalesce((select group_concat(u."name", ', ') from "users" u where u."house_id" = "houses"."id"), "houses"."owner_name")`;
