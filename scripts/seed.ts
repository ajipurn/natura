/**
 * Seed awal Cluster Natura (isi lengkapnya di scripts/seed-core.ts).
 *
 *   bun run seed           → database lokal `bun run dev`; kalau server dev sedang jalan, seed dititipkan ke sana
 *   bun run seed:remote    → Supabase (REMOTE_DATABASE_URL di .env)
 *
 * Jalankan setelah admin pertama dibuat di /admin/setup. Aman diulang: rumah, akun, dan jadwal yang
 * sudah ada tidak ditimpa. `--jadwal` mengganti jadwal yang ada dengan isi file jadwal.
 */
import path from "node:path";
import { openTarget } from "./db-target";
import { DEV_SEED_PATH, DEV_TOKEN_HEADER, runningDevServer, type DevServerInfo } from "./dev-server-info";
import { seed } from "./seed-core";

const ROOT = path.resolve(import.meta.dirname, "..");
const remote = process.argv.includes("--remote");
const replaceSchedule = process.argv.includes("--jadwal");

/** Jalankan seed di server dev. `null` kalau servernya tidak bisa dihubungi (catatannya basi). */
async function seedViaDevServer(dev: DevServerInfo): Promise<boolean | null> {
  let res: Response;
  try {
    res = await fetch(dev.url + DEV_SEED_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json", [DEV_TOKEN_HEADER]: dev.token },
      body: JSON.stringify({ replaceSchedule }),
    });
  } catch {
    return null;
  }
  if (res.status === 404) return null;
  const result = (await res.json()) as { ok: boolean; lines: string[]; error?: string };
  for (const line of result.lines) console.log(line);
  if (!result.ok) console.error("✗ Seed gagal:", result.error);
  return result.ok;
}

async function main() {
  const dev = remote ? null : runningDevServer(ROOT);
  const viaDev = dev ? await seedViaDevServer(dev) : null;
  if (viaDev !== null) process.exit(viaDev ? 0 : 1);

  const target = await openTarget(remote);
  try {
    await seed(target.db, { root: ROOT, label: target.label, remote, replaceSchedule, log: (line) => console.log(line) });
  } finally {
    await target.close();
  }
}

main().catch((err) => {
  console.error("✗ Seed gagal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
