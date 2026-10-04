import "server-only";

/** Hasil Server Action untuk ditampilkan di form. */
export type FormState = { error?: string; success?: string } | undefined;

export function getString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export function getInt(formData: FormData, key: string): number | null {
  const raw = getString(formData, key).replace(/[.\s]/g, "");
  if (!/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) ? value : null;
}

/** Hanya izinkan redirect ke path internal (mencegah open redirect). */
export function safeNextPath(value: string | null | undefined, fallback: string): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return fallback;
  }
  return value;
}
