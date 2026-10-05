import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { MutationCache, QueryCache, QueryClient, defaultShouldDehydrateQuery, type QueryKey } from "@tanstack/react-query";
import type { PersistQueryClientOptions } from "@tanstack/react-query-persist-client";
import { del, get, set } from "idb-keyval";
import { ApiError } from "./api";

const DAY = 24 * 60 * 60_000;

function onError(err: unknown) {
  // Sesi habis di tengah jalan: periksa ulang status login supaya layar masuk muncul.
  if (err instanceof ApiError && err.status === 401) void queryClient.invalidateQueries({ queryKey: ["auth"] });
}

/**
 * Data yang sudah dimuat disimpan di memori, jadi pindah halaman langsung tampil
 * lalu diperbarui di belakang layar. Salinannya juga disimpan di HP (lihat `persistOptions`).
 */
export const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError }),
  mutationCache: new MutationCache({ onError }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Data halaman yang tidak dibuka sehari dibuang dari memori, dan ikut hilang dari salinan di HP.
      gcTime: DAY,
      retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
    },
  },
});

export function invalidate(...keys: QueryKey[]) {
  return Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
}

/** IndexedDB yang tidak menjawab (pernah terjadi di Safari) tidak boleh menahan app: anggap gagal. */
function withTimeout<T>(promise: Promise<T>, fallback: T): Promise<T> {
  return Promise.race([promise.catch(() => fallback), new Promise<T>((resolve) => setTimeout(() => resolve(fallback), 2_000))]);
}

/**
 * Di IndexedDB, bukan localStorage: localStorage kecil dan dipakai antrean catatan petugas yang
 * belum terkirim, jadi jangan sampai penuh oleh cache.
 */
const idbStorage = {
  getItem: (key: string) => withTimeout(get<string>(key), undefined),
  setItem: (key: string, value: string) => withTimeout(set(key, value), undefined),
  removeItem: (key: string) => withTimeout(del(key), undefined),
};

export type AppName = "warga" | "petugas" | "admin";
const APPS: readonly AppName[] = ["warga", "petugas", "admin"];
const cacheKey = (app: AppName) => `jimpitan:query:${app}`;

/**
 * Salinan cache di HP, per app: app yang dibuka lagi langsung menampilkan data terakhir (juga saat
 * offline), lalu diperbarui dari server (lihat `refreshRestored`).
 */
export function persistOptions(app: AppName): Omit<PersistQueryClientOptions, "queryClient"> {
  return {
    persister: createAsyncStoragePersister({ storage: idbStorage, key: cacheKey(app) }),
    maxAge: 7 * DAY,
    // Versi app baru bisa mengubah bentuk data: salinan dari versi lama tidak dipakai.
    buster: __BUILD_ID__,
    dehydrateOptions: {
      // Status login sudah punya salinan sendiri (lihat `authQuery`). Mutasi tidak dilanjutkan dari salinan.
      shouldDehydrateQuery: (query) => defaultShouldDehydrateQuery(query) && query.queryKey[0] !== "auth",
      shouldDehydrateMutation: () => false,
    },
  };
}

/**
 * Data dari salinan di HP selalu diminta ulang begitu app dibuka, walau umurnya belum lewat
 * `staleTime`: bisa jadi status login berubah di app lain sejak salinan itu dibuat.
 */
export function refreshRestored() {
  void queryClient.invalidateQueries();
}

/**
 * Hapus semua data di memori dan salinannya di HP saat masuk atau keluar akun. Salinan ketiga app
 * ikut dihapus, karena status login berlaku di semuanya.
 */
export function clearCache() {
  queryClient.clear();
  for (const app of APPS) void idbStorage.removeItem(cacheKey(app));
}
