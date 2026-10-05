import type { QueryKey } from "@tanstack/react-query";
import { errorMessage } from "./api";
import { invalidate } from "./query";

/** Hasil form untuk ditampilkan (pakai dengan useActionState). */
export type FormState = { error?: string; success?: string } | undefined;

export function str(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

/** Angka bulat dari input; "1.000" dan "1 000" dibaca 1000. Kosong/salah = NaN (ditolak server). */
export function int(formData: FormData, key: string): number {
  const raw = str(formData, key).replace(/[.\s]/g, "");
  return /^\d+$/.test(raw) ? Number(raw) : NaN;
}

export function checked(formData: FormData, key: string): boolean {
  return formData.get(key) === "on";
}

/**
 * Jalankan aksi form: tampilkan pesan sukses dari server (atau `success`), segarkan data terkait,
 * dan ubah error jadi pesan di form.
 */
export async function runForm(
  action: () => Promise<unknown>,
  options: { invalidate?: QueryKey[]; success?: string } = {},
): Promise<FormState> {
  try {
    const result = (await action()) as { success?: string } | null;
    await invalidate(...(options.invalidate ?? []));
    return { success: result?.success ?? options.success };
  } catch (err) {
    return { error: errorMessage(err) };
  }
}
