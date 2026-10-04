import "server-only";
import { eq } from "drizzle-orm";
import { jwtVerify, SignJWT } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { Role } from "@/lib/types";
import { getDb } from "./db";
import { users } from "./schema";

const COOKIE_NAME = "jimpitan_session";
const SESSION_DAYS = 90;
/** Sesi diperpanjang otomatis kalau umurnya sudah lewat sekian hari. */
const REFRESH_AFTER_DAYS = 7;
const DAY_SECONDS = 24 * 60 * 60;

export type SessionUser = { id: number; name: string; role: Role };

function getSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (secret && secret.length >= 32) return new TextEncoder().encode(secret);
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET wajib diisi (minimal 32 karakter).");
  }
  return new TextEncoder().encode("dev-only-secret-jangan-dipakai-di-production!");
}

export async function startSession(user: { id: number; sessionVersion: number }) {
  const token = await new SignJWT({ v: user.sessionVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(user.id))
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(getSecret());
  (await cookies()).set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * DAY_SECONDS,
  });
}

export async function endSession() {
  (await cookies()).delete(COOKIE_NAME);
}

type Session = { user: SessionUser; sessionVersion: number; issuedAt: number };

const readSession = cache(async (): Promise<Session | null> => {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;

  let payload;
  try {
    ({ payload } = await jwtVerify(token, getSecret(), { algorithms: ["HS256"] }));
  } catch {
    return null;
  }
  const id = Number(payload.sub);
  if (!Number.isInteger(id)) return null;

  const db = await getDb();
  const [user] = await db
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
});

export async function getCurrentUser(): Promise<SessionUser | null> {
  return (await readSession())?.user ?? null;
}

/**
 * Perpanjang cookie sesi supaya petugas yang rutin ronda tidak perlu login ulang.
 * Hanya bisa dipanggil dari Route Handler atau Server Action.
 */
export async function refreshSessionIfNeeded() {
  const session = await readSession();
  if (!session) return;
  const ageSeconds = Date.now() / 1000 - session.issuedAt;
  if (ageSeconds > REFRESH_AFTER_DAYS * DAY_SECONDS) {
    await startSession({ id: session.user.id, sessionVersion: session.sessionVersion });
  }
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/ronda");
  return user;
}
