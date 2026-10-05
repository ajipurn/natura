import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * Server `bun run dev` yang sedang jalan dicatat di .data/dev-server.json, supaya `bun run seed`
 * bisa menitipkan seed ke sana (PGlite hanya boleh dibuka satu proses). Token acak di file itu
 * membuktikan pemanggilnya ada di komputer ini.
 */
export type DevServerInfo = { pid: number; url: string; token: string };

export const DEV_SEED_PATH = "/__dev/seed";
export const DEV_TOKEN_HEADER = "x-natura-dev-token";

const infoFile = (root: string) => path.join(root, ".data/dev-server.json");

export function writeDevServerInfo(root: string, info: DevServerInfo) {
  mkdirSync(path.dirname(infoFile(root)), { recursive: true });
  writeFileSync(infoFile(root), JSON.stringify(info), { mode: 0o600 });
}

function readDevServerInfo(root: string): DevServerInfo | null {
  try {
    return JSON.parse(readFileSync(infoFile(root), "utf8")) as DevServerInfo;
  } catch {
    return null;
  }
}

/** Hapus catatan server ini saja (server baru setelah restart Vite punya token lain). */
export function removeDevServerInfo(root: string, token: string) {
  if (readDevServerInfo(root)?.token === token) rmSync(infoFile(root), { force: true });
}

/** Server dev yang tercatat dan prosesnya masih hidup. */
export function runningDevServer(root: string): DevServerInfo | null {
  const info = readDevServerInfo(root);
  if (!info) return null;
  try {
    process.kill(info.pid, 0);
    return info;
  } catch {
    return null;
  }
}
