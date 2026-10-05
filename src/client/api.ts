import { hc, type ClientResponse } from "hono/client";
import type { AppType } from "@/server/app";

/** Klien API bertipe: pemanggilan /api/* ikut dicek TypeScript terhadap rute di server. */
export const api = hc<AppType>("/").api;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

type OkBody<R> = R extends ClientResponse<infer B, infer S, infer _F> ? (S extends 200 | 201 ? B : never) : never;

/** Jalankan pemanggilan API; respons gagal dilempar sebagai ApiError dengan pesan dari server. */
export async function call<R extends ClientResponse<unknown, number, string>>(request: Promise<R>): Promise<OkBody<R>> {
  let res: R;
  try {
    res = await request;
  } catch {
    throw new ApiError(0, "Tidak ada koneksi internet. Coba lagi.");
  }
  const data = (await res.json().catch(() => null)) as { error?: string } | null;
  if (!res.ok) throw new ApiError(res.status, data?.error ?? `Terjadi kesalahan (${res.status}). Coba lagi.`);
  return data as OkBody<R>;
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Terjadi kesalahan. Coba lagi.";
}
