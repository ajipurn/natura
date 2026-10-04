import "server-only";
import { headers } from "next/headers";

/**
 * Alamat publik aplikasi untuk dicetak di QR. Set APP_URL supaya QR tidak bergantung
 * pada alamat yang kebetulan dipakai admin saat mencetak.
 */
export async function getAppOrigin(): Promise<{ origin: string; fromEnv: boolean }> {
  const fromEnv = process.env.APP_URL?.trim();
  if (fromEnv) return { origin: fromEnv.replace(/\/+$/, ""), fromEnv: true };

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (/^(localhost|127\.)/.test(host) ? "http" : "https");
  return { origin: `${proto}://${host}`, fromEnv: false };
}
