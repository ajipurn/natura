/** Satu project, dengan pintu masuk terpisah untuk setiap bagian Cluster Natura. */
export const COMMUNITY_DOMAIN = "clusternatura.com";
export const APP_DOMAINS = {
  petugas: `app.${COMMUNITY_DOMAIN}`,
  admin: `dashboard.${COMMUNITY_DOMAIN}`,
  warga: `info.${COMMUNITY_DOMAIN}`,
} as const;

export type AppSurface = keyof typeof APP_DOMAINS;
export const NATURA_HOSTS = [COMMUNITY_DOMAIN, `www.${COMMUNITY_DOMAIN}`, ...Object.values(APP_DOMAINS)];

export function appSurface(hostname: string): AppSurface | "landing" | null {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (host === COMMUNITY_DOMAIN || host === `www.${COMMUNITY_DOMAIN}`) return "landing";
  for (const app of ["petugas", "admin", "warga"] as const) {
    if (host === APP_DOMAINS[app]) return app;
  }
  return null;
}

const LEGACY_BASE = { petugas: "/petugas", admin: "/admin", warga: "" };
const currentHost = () => typeof location === "undefined" ? "" : location.hostname;

/** Alamat di app sendiri relatif; pindah bagian memakai subdomain. Dev/preview tetap memakai path lama. */
export function appPath(app: AppSurface, path = "", hostname = currentHost()): string {
  const surface = appSurface(hostname);
  if (!surface) return `${LEGACY_BASE[app]}${path}` || "/";
  const target = !path ? "/" : path.startsWith("/") ? path : `/${path}`;
  return surface === app ? target : `https://${APP_DOMAINS[app]}${target}`;
}

export const adminPath = (path = "", hostname = currentHost()) => appPath("admin", path, hostname);
export const petugasPath = (path = "", hostname = currentHost()) => appPath("petugas", path, hostname);
export const wargaPath = (path = "", hostname = currentHost()) => appPath("warga", path, hostname);

/** QR rumah dan link kode warga selalu membuka Info warga, walau dibuat dari dashboard. */
export function wargaOrigin(origin: string): string {
  return appSurface(new URL(origin).hostname) ? `https://${APP_DOMAINS.warga}` : origin.replace(/\/+$/, "");
}
