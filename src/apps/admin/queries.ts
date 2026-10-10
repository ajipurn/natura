import { queryOptions } from "@tanstack/react-query";
import { api, call } from "@/client/api";

export const housesQuery = queryOptions({
  queryKey: ["admin", "rumah"],
  queryFn: () => call(api.admin.rumah.$get()),
});

/** Data rumah dipakai di banyak layar (ronda, jadwal, ringkasan, petugas): segarkan semuanya setelah diubah. */
export const HOUSE_REFRESH = [["admin"], ["ronda"], ["riwayat"], ["rekap"], ["jadwal"], ["auth", "users"]];

export const paymentsQuery = (month: string) => queryOptions({
  queryKey: ["admin", "pembayaran", month],
  queryFn: () => call(api.admin.pembayaran.$get({ query: { bulan: month } })),
});

export const rapelQuery = queryOptions({
  queryKey: ["admin", "pembayaran", "rapel"],
  queryFn: () => call(api.admin.pembayaran.rapel.$get()),
});

export const PAYMENT_REFRESH = [["admin"], ["rekap"], ["riwayat"], ["ronda"], ["rumah"], ["warga"]];

export const usersQuery = queryOptions({
  queryKey: ["admin", "petugas"],
  queryFn: () => call(api.admin.petugas.$get()),
});

export const residentsQuery = queryOptions({
  queryKey: ["admin", "warga"],
  queryFn: () => call(api.admin.warga.$get()),
});

export const familiesQuery = queryOptions({ queryKey: ["admin", "keluarga"], queryFn: () => call(api.admin.keluarga.$get()) });
export const duesQuery = (month: string) => queryOptions({ queryKey: ["admin", "iuran", month], queryFn: () => call(api.admin.iuran.$get({ query: { bulan: month } })) });
export const DUES_REFRESH = [["admin", "iuran"], ["admin", "iuran-log"], ["admin", "kas"], ["admin", "ringkasan"], ["warga"]];

export const settingsQuery = queryOptions({
  queryKey: ["admin", "pengaturan"],
  queryFn: () => call(api.admin.pengaturan.$get()),
});

export const dashboardQuery = queryOptions({
  queryKey: ["admin", "ringkasan"],
  queryFn: () => call(api.admin.ringkasan.$get()),
  // Ringkasan malam ini diperbarui sendiri selama halaman terbuka.
  refetchInterval: 30_000,
});

export const infoQuery = queryOptions({
  queryKey: ["admin", "info"],
  queryFn: () => call(api.admin.info.$get()),
});

export const recapQuery = (month: string) =>
  queryOptions({
    queryKey: ["rekap", month],
    queryFn: () => call(api.rekap.$get({ query: { bulan: month } })),
  });

/** Permintaan ubah jadwal dari petugas (yang menunggu dulu). */
export const requestsQuery = queryOptions({
  queryKey: ["admin", "permintaan"],
  queryFn: () => call(api.admin.permintaan.$get()),
  refetchInterval: 60_000,
});

/** Jejak audit catatan satu malam ronda. */
export const auditQuery = (date: string) =>
  queryOptions({
    queryKey: ["admin", "audit", date],
    queryFn: () => call(api.admin.audit.$get({ query: { tanggal: date } })),
    refetchInterval: 60_000,
  });

/** Kas satu bulan: setoran per malam, pemasukan lain, pengeluaran, dan saldo. */
export const cashQuery = (month: string) =>
  queryOptions({
    queryKey: ["admin", "kas", month],
    queryFn: () => call(api.admin.kas.$get({ query: { bulan: month } })),
  });

/** Catatan kas tampil di halaman Kas dan Ringkasan. */
export const CASH_REFRESH = [["admin", "kas"], ["admin", "ringkasan"]];

/** Titik acuan kalibrasi denah ↔ GPS. */
export const planAnchorsQuery = queryOptions({
  queryKey: ["admin", "denah-lokasi"],
  queryFn: () => call(api.admin.denah.lokasi.$get()),
});
