import { queryOptions } from "@tanstack/react-query";
import { api, call } from "@/client/api";

export const housesQuery = queryOptions({
  queryKey: ["admin", "rumah"],
  queryFn: () => call(api.admin.rumah.$get()),
});

export const usersQuery = queryOptions({
  queryKey: ["admin", "petugas"],
  queryFn: () => call(api.admin.petugas.$get()),
});

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
