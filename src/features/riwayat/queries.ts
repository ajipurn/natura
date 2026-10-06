import { queryOptions } from "@tanstack/react-query";
import { api, call } from "@/client/api";

export const patrolsQuery = queryOptions({
  queryKey: ["riwayat"],
  // Tanpa `bulan`: 90 malam terbaru.
  queryFn: () => call(api.riwayat.$get({ query: { bulan: undefined } })),
});

/** Semua malam ronda satu bulan ("YYYY-MM"), untuk kalender. */
export const monthPatrolsQuery = (month: string) =>
  queryOptions({
    queryKey: ["riwayat", "bulan", month],
    queryFn: () => call(api.riwayat.$get({ query: { bulan: month } })),
  });

export const patrolQuery = (date: string) =>
  queryOptions({
    queryKey: ["riwayat", date],
    queryFn: () => call(api.riwayat[":date"].$get({ param: { date } })),
  });

/** Layar yang menampilkan catatan jimpitan: segarkan semuanya setelah admin mengoreksi. */
export const CORRECTION_REFRESH = [["riwayat"], ["rekap"], ["admin", "ringkasan"], ["admin", "audit"]];
