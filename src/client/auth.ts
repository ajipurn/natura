import { queryOptions, useQuery } from "@tanstack/react-query";
import type { SessionUser } from "@/server/auth";
import { api, call } from "./api";

export type AuthStatus = { setupNeeded: boolean; user: SessionUser | null };

const STORAGE_KEY = "jimpitan:auth";

function readStored(): AuthStatus | undefined {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AuthStatus) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Status login. Disimpan juga di HP supaya app petugas tetap bisa dibuka saat offline;
 * begitu online, langsung diperiksa ulang ke server.
 */
export const authQuery = queryOptions({
  queryKey: ["auth"],
  queryFn: async (): Promise<AuthStatus> => {
    const status = await call(api.auth.$get());
    try {
      if (status.user) localStorage.setItem(STORAGE_KEY, JSON.stringify(status));
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      // localStorage bisa diblokir; abaikan.
    }
    return status;
  },
  initialData: readStored,
  initialDataUpdatedAt: 0,
  staleTime: 60_000,
});

export function useAuth() {
  return useQuery(authQuery);
}

/** Hanya izinkan kembali ke alamat internal (mencegah open redirect). */
export function safeNext(value: string | null | undefined, fallback: string): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  return value;
}
