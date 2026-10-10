/** Kesalahan konfigurasi yang dapat ditampilkan API dev tanpa overlay Vite. */
export class LocalDatabaseConfigError extends Error {}

/** DATABASE_URL saat development dan perintah lokal harus menunjuk loopback. */
export function localDatabaseUrl(value: string | undefined, label = "DATABASE_URL") {
  if (!value?.trim()) return undefined;
  let url: URL;
  try { url = new URL(value); } catch {
    throw new LocalDatabaseConfigError(`${label} belum berisi URL PostgreSQL yang valid. Periksa .env.local, lalu jalankan ulang bun run dev.`);
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    throw new LocalDatabaseConfigError(`${label} belum mengarah ke PostgreSQL di localhost. Hentikan server dev, jalankan make db-sync untuk menyiapkan database lokal, lalu jalankan bun run dev.`);
  if (url.search || url.hash)
    throw new LocalDatabaseConfigError(`${label} untuk database lokal harus memakai URL tanpa query parameter atau fragmen. Perbaiki .env.local, lalu jalankan ulang bun run dev.`);
  return url.href;
}
