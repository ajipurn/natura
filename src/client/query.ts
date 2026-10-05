import { MutationCache, QueryCache, QueryClient, type QueryKey } from "@tanstack/react-query";
import { ApiError } from "./api";

function onError(err: unknown) {
  // Sesi habis di tengah jalan: periksa ulang status login supaya layar masuk muncul.
  if (err instanceof ApiError && err.status === 401) void queryClient.invalidateQueries({ queryKey: ["auth"] });
}

/**
 * Data yang sudah dimuat disimpan di memori, jadi pindah halaman langsung tampil
 * lalu diperbarui di belakang layar.
 */
export const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError }),
  mutationCache: new MutationCache({ onError }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
    },
  },
});

export function invalidate(...keys: QueryKey[]) {
  return Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
}
