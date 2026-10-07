import { queryOptions } from "@tanstack/react-query";
import { api, call } from "@/client/api";

export const scheduleQuery = queryOptions({ queryKey: ["jadwal"], queryFn: () => call(api.jadwal.$get()) });

/** Permintaan ubah jadwal milik petugas yang sedang masuk. */
export const myRequestsQuery = queryOptions({
  queryKey: ["jadwal", "permintaan"],
  queryFn: () => call(api.jadwal.permintaan.$get()),
  refetchInterval: 30_000,
});
