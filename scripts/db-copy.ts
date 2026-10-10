import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDb } from "../src/server/db";
import { localDatabaseUrl } from "../src/server/local-database";
import { runningDevServer } from "./dev-server-info";

export const DEFAULT_LOCAL_DATABASE_URL = "postgresql://natura@127.0.0.1:5433/natura";
const root = path.resolve(import.meta.dirname, "..");
const dataDir = path.join(root, ".data", "postgres");
const dumpsDir = path.join(root, ".data", "dumps");
const stamp = () => new Date().toISOString().replace(/[:.]/g, "-");

/** URL/password tidak pernah dimasukkan ke argumen proses atau log. */
export function postgresEnvironment(value: string, remote: boolean, inherited: NodeJS.ProcessEnv = process.env) {
  const url = new URL(value);
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.pathname.slice(1)) throw new Error("Isi URL PostgreSQL beserta nama database.");
  return {
    ...Object.fromEntries(Object.entries(inherited).filter(([key]) => !key.startsWith("PG"))),
    PGHOST: url.hostname.replace(/^\[|\]$/g, ""), PGPORT: url.port || "5432",
    PGDATABASE: decodeURIComponent(url.pathname.slice(1)), PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password), PGPASSFILE: "/dev/null", PGCONNECT_TIMEOUT: "10",
    PGSSLMODE: remote ? url.searchParams.get("sslmode") || "require" : "disable",
  };
}

export function assertDifferentDatabases(source: string, target: string) {
  const key = (value: string) => {
    const url = new URL(value);
    const host = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ? "loopback" : url.hostname;
    return `${host}:${url.port || "5432"}/${decodeURIComponent(url.pathname.slice(1))}`;
  };
  if (key(source) === key(target)) throw new Error("Database sumber dan tujuan sama. Restore dibatalkan.");
}

function command(name: string, args: string[], env: NodeJS.ProcessEnv = process.env, quiet = false) {
  const binary = process.env.PG_BIN ? path.join(process.env.PG_BIN, name) : name;
  const result = spawnSync(binary, args, { cwd: root, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 10 * 1024 * 1024 });
  if (!quiet && (result.error || result.status !== 0)) {
    const reason = (result.error as NodeJS.ErrnoException | undefined)?.code === "ENOENT" ? "tool belum tersedia; pasang PostgreSQL dan atur PG_BIN." : result.stderr.trim() || result.error?.message || "proses berhenti";
    throw new Error(`${name} gagal: ${reason}`);
  }
  return result;
}

function requireStoppedDev() {
  if (runningDevServer(root)) throw new Error("Hentikan bun run dev sebelum restore atau mengubah konfigurasi database lokal.");
}

async function startLocal(url: string) {
  if (url === DEFAULT_LOCAL_DATABASE_URL) {
    mkdirSync(path.dirname(dataDir), { recursive: true, mode: 0o700 });
    if (!existsSync(path.join(dataDir, "PG_VERSION")))
      command("initdb", ["-D", dataDir, "-U", "natura", "-A", "trust", "--encoding=UTF8", "--no-locale"]);
    if (command("pg_ctl", ["-D", dataDir, "status"], process.env, true).status !== 0)
      command("pg_ctl", ["-D", dataDir, "-l", path.join(dataDir, "server.log"), "-o", "-h 127.0.0.1 -p 5433 -k ''", "-w", "-t", "30", "start"]);
  }
  const parsed = new URL(url);
  const name = decodeURIComponent(parsed.pathname.slice(1));
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(name)) throw new Error("Nama database lokal harus huruf kecil, angka, atau underscore.");
  parsed.pathname = "/postgres";
  const db = createDb(parsed.href);
  try {
    const { rows } = await db.execute(sql`select 1 from pg_database where datname = ${name}`);
    if (!rows.length) await db.$client.query(`create database "${name}"`);
  } finally { await db.$client.end(); }
}

function configureLocal(url: string) {
  const file = path.join(root, ".env.local");
  let contents = existsSync(file) ? readFileSync(file, "utf8") : "";
  for (const [key, value] of Object.entries({ DATABASE_URL: url, LOCAL_DATABASE_URL: url, APP_URL: "", ...(process.env.PG_BIN && { PG_BIN: process.env.PG_BIN }) })) {
    const line = `${key}=${JSON.stringify(value)}`;
    const pattern = new RegExp(`^(?:export\\s+)?${key}\\s*=.*$`, "gm");
    contents = pattern.test(contents) ? contents.replace(pattern, () => line) : contents.replace(/\n?$/, "\n") + line + "\n";
  }
  const temporary = file + ".tmp";
  writeFileSync(temporary, contents, { mode: 0o600 });
  chmodSync(temporary, 0o600);
  renameSync(temporary, file);
  console.log("✓ .env.local memakai database lokal; APP_URL mengikuti localhost.");
}

function dump(url: string, file: string, remote: boolean) {
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = file + ".tmp";
  writeFileSync(temporary, "", { mode: 0o600 });
  chmodSync(temporary, 0o600);
  try {
    command("pg_dump", ["--format=custom", "--schema=public", "--schema=drizzle", "--no-owner", "--no-privileges", "--no-policies", "--no-publications", "--no-subscriptions", "--lock-wait-timeout=10000", "--no-password", "--file", temporary], postgresEnvironment(url, remote));
    renameSync(temporary, file);
  } finally { rmSync(temporary, { force: true }); }
  console.log(`✓ Dump ${remote ? "remote" : "lokal"}: ${path.relative(root, file)}`);
}

async function restore(url: string, file: string) {
  // Guard dijalankan lagi di batas penulisan, sebelum koneksi/pg_restore dibuat.
  localDatabaseUrl(url, "LOCAL_DATABASE_URL");
  command("pg_restore", ["--list", file]);
  await startLocal(url);
  const backup = path.join(dumpsDir, `local-before-restore-${stamp()}.dump`);
  dump(url, backup, false);
  command("pg_restore", ["--clean", "--if-exists", "--single-transaction", "--exit-on-error", "--no-owner", "--no-privileges", "--no-policies", "--no-publications", "--no-subscriptions", "--no-password", "--dbname", new URL(url).pathname.slice(1), file], postgresEnvironment(url, false));
  const db = createDb(url);
  try { await migrate(db, { migrationsFolder: path.join(root, "drizzle") }); }
  finally { await db.$client.end(); }
  configureLocal(url);
  console.log("✓ Restore dan migrasi lokal selesai. Jalankan bun run dev.");
}

async function main() {
  const action = process.argv[2];
  if (!["start", "stop", "dump", "restore", "sync"].includes(action)) throw new Error("Gunakan make db-start, db-stop, db-dump, db-restore, atau db-sync.");
  const local = localDatabaseUrl(process.env.LOCAL_DATABASE_URL || DEFAULT_LOCAL_DATABASE_URL, "LOCAL_DATABASE_URL")!;
  const remote = process.env.REMOTE_DATABASE_URL;
  const file = path.resolve(root, process.argv[3] || ".data/dumps/remote.dump");
  if (action === "start" || action === "restore" || action === "sync") requireStoppedDev();
  if (remote) assertDifferentDatabases(remote, local);
  if (action === "dump" || action === "sync") {
    if (!remote) throw new Error("Isi REMOTE_DATABASE_URL (Session pooler Supabase) di .env.local.");
    dump(remote, file, true);
  }
  if (action === "restore" || action === "sync") await restore(local, file);
  if (action === "start") { await startLocal(local); configureLocal(local); }
  if (action === "stop") {
    if (local !== DEFAULT_LOCAL_DATABASE_URL) throw new Error("db-stop hanya mengelola PostgreSQL proyek di port 5433.");
    if (existsSync(path.join(dataDir, "PG_VERSION"))) command("pg_ctl", ["-D", dataDir, "-m", "fast", "-w", "-t", "30", "stop"]);
  }
}

if (import.meta.main) main().catch((error) => { console.error("✗", error instanceof Error ? error.message : "Salin database gagal."); process.exitCode = 1; });
