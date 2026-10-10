import { eq } from "drizzle-orm";
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import { jwtVerify, SignJWT } from "jose";
import type { Role } from "@/lib/types";
import { can, type Resource } from "@/lib/permissions";
import { COMMUNITY_DOMAIN, appSurface } from "@/lib/app-paths";
import type { AppEnv } from "./env";
import { users } from "./schema";

const SESSION_COOKIE = "jimpitan_session";
const WARGA_COOKIE = "jimpitan_warga";
const SESSION_DAYS = 90;
/** Sesi diperpanjang otomatis kalau umurnya sudah lewat sekian hari. */
const REFRESH_AFTER_DAYS = 7;
const DAY_SECONDS = 24 * 60 * 60;

export type SessionUser = { id: number; name: string; role: Role };

type Ctx = Context<AppEnv>;

function isDev(c: Ctx) {
  return c.env.DEV === "1";
}

function getSecret(c: Ctx): Uint8Array {
  const secret = c.env.AUTH_SECRET;
  if (secret && secret.length >= 32) return new TextEncoder().encode(secret);
  if (!isDev(c)) throw new Error("AUTH_SECRET wajib diisi (minimal 32 karakter) di Environment Variables Vercel.");
  return new TextEncoder().encode("dev-only-secret-jangan-dipakai-di-production!");
}

async function sign(c: Ctx, claims: Record<string, unknown>, subject: string, days: number) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(subject)
    .setIssuedAt()
    .setExpirationTime(`${days}d`)
    .sign(getSecret(c));
}

async function verify(c: Ctx, token: string | undefined) {
  if (!token) return null;
  try {
    return (await jwtVerify(token, getSecret(c), { algorithms: ["HS256"] })).payload;
  } catch {
    return null;
  }
}

function cookieOptions(c: Ctx, days: number) {
  return {
    httpOnly: true,
    secure: !isDev(c),
    sameSite: "Lax" as const,
    path: "/",
    // Satu sesi untuk app petugas, dashboard, dan info; preview/dev tetap host-only.
    domain: appSurface(new URL(c.req.url).hostname) ? COMMUNITY_DOMAIN : undefined,
    maxAge: days * DAY_SECONDS,
  };
}

export async function startSession(c: Ctx, user: { id: number; sessionVersion: number }) {
  const token = await sign(c, { v: user.sessionVersion }, String(user.id), SESSION_DAYS);
  setCookie(c, SESSION_COOKIE, token, cookieOptions(c, SESSION_DAYS));
}

export function endSession(c: Ctx) {
  endCookie(c, SESSION_COOKIE);
}

function endCookie(c: Ctx, name: string) {
  const { path, domain, secure, httpOnly, sameSite } = cookieOptions(c, 0);
  deleteCookie(c, name, { path, domain, secure, httpOnly, sameSite });
  // Hapus juga cookie host-only dari versi sebelum memakai subdomain.
  if (domain) deleteCookie(c, name, { path, secure, httpOnly, sameSite });
}

type Session = { user: SessionUser; sessionVersion: number; issuedAt: number };

async function readSession(c: Ctx): Promise<Session | null> {
  const payload = await verify(c, getCookie(c, SESSION_COOKIE));
  const id = Number(payload?.sub);
  if (!payload || !Number.isInteger(id)) return null;

  const [user] = await c.var.db
    .select({
      id: users.id,
      name: users.name,
      role: users.role,
      active: users.active,
      sessionVersion: users.sessionVersion,
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  if (!user || !user.active || user.sessionVersion !== payload.v) return null;

  return {
    user: { id: user.id, name: user.name, role: user.role },
    sessionVersion: user.sessionVersion,
    issuedAt: payload.iat ?? 0,
  };
}

export async function getSessionUser(c: Ctx): Promise<SessionUser | null> {
  return (await readSession(c))?.user ?? null;
}

const unauthorized = (c: Ctx) => c.json({ error: "Sesi login habis. Silakan masuk lagi." }, 401);

/** Wajib login (petugas atau admin). Sesi diperpanjang supaya petugas yang rutin ronda tidak perlu login ulang. */
export const requireUser = createMiddleware<AppEnv>(async (c, next) => {
  const session = await readSession(c);
  if (!session) return unauthorized(c);
  if (Date.now() / 1000 - session.issuedAt > REFRESH_AFTER_DAYS * DAY_SECONDS) {
    await startSession(c, { id: session.user.id, sessionVersion: session.sessionVersion });
  }
  c.set("user", session.user);
  await next();
});

export const requireAdmin = createMiddleware<AppEnv>(async (c, next) => {
  const user = await getSessionUser(c);
  if (!user) return unauthorized(c);
  if (!can(user.role, "accounts", true)) return c.json({ error: "Khusus admin atau ketua." }, 403);
  c.set("user", user);
  await next();
});

/** Hak akses diperiksa dari peran terkini di database pada setiap permintaan. */
export function requireResource(resource: Resource, write?: boolean) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const user = await getSessionUser(c);
    if (!user) return unauthorized(c);
    if (!can(user.role, resource, write ?? !["GET", "HEAD"].includes(c.req.method))) {
      return c.json({ error: "Peran akunmu tidak memiliki akses ke tindakan ini." }, 403);
    }
    c.set("user", user);
    await next();
  });
}

/** Satu pemetaan untuk seluruh rute dashboard lama; rute baru memakai requireResource langsung. */
export const requireDashboardResource = createMiddleware<AppEnv>(async (c, next) => {
  const section = c.req.path.match(/\/admin\/([^/]+)/)?.[1];
  const resources: Record<string, Resource> = {
    ringkasan: "overview", rumah: "houses", denah: "houses", petugas: "accounts",
    pengaturan: "settings", jadwal: "schedule", permintaan: "schedule", audit: "patrols", riwayat: "patrols",
    kas: "finance", info: "info", pengumuman: "info", kontak: "info",
  };
  const resource = c.req.path.endsWith("/pengaturan/kode-warga") ? "info" : resources[section ?? ""];
  if (!resource) return requireAdmin(c, next);
  return requireResource(resource)(c, next);
});

/* ---------- Kompatibilitas akses warga lama ---------- */

export function endWargaAccess(c: Ctx) {
  endCookie(c, WARGA_COOKIE);
}

/** Info warga memakai sesi akun; cookie kode bersama lama tidak memberikan akses. */
export async function hasWargaAccess(c: Ctx): Promise<boolean> {
  return (await getSessionUser(c)) !== null;
}
