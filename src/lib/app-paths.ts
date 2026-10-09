/** Satu project, dengan pintu masuk terpisah untuk setiap bagian Cluster Natura. */
export const COMMUNITY_DOMAIN = "clusternatura.com";
export const APP_DOMAINS = {
  petugas: `app.${COMMUNITY_DOMAIN}`,
  admin: `app.${COMMUNITY_DOMAIN}`,
  warga: COMMUNITY_DOMAIN,
} as const;
export const APP_BASE_PATHS = { petugas: "", admin: "/dashboard", warga: "/info" };
export const LEGACY_APP_DOMAINS = { admin: `dashboard.${COMMUNITY_DOMAIN}`, warga: `info.${COMMUNITY_DOMAIN}` };

export type AppSurface = keyof typeof APP_DOMAINS;
export const NATURA_HOSTS = [...new Set([COMMUNITY_DOMAIN, `www.${COMMUNITY_DOMAIN}`, ...Object.values(APP_DOMAINS), ...Object.values(LEGACY_APP_DOMAINS)])];
const normalizedHost = (hostname: string) => hostname.toLowerCase().replace(/\.$/, "");

export function appSurface(hostname: string, pathname = "/"): AppSurface | "landing" | null {
  const host = normalizedHost(hostname);
  if (host === APP_DOMAINS.petugas) return /^\/dashboard(?:\/|$)/.test(pathname) ? "admin" : "petugas";
  if (host === COMMUNITY_DOMAIN || host === `www.${COMMUNITY_DOMAIN}`) {
    return /^\/info(?:\/|$)/.test(pathname) ? "warga" : "landing";
  }
  if (host === LEGACY_APP_DOMAINS.admin) return "admin";
  if (host === LEGACY_APP_DOMAINS.warga) return "warga";
  return null;
}

const LEGACY_BASE = { petugas: "/petugas", admin: "/admin", warga: "" };
const currentHost = () => typeof location === "undefined" ? "" : location.hostname;

/** Alamat pada host yang sama relatif; dev/preview tetap memakai path lama. */
export function appPath(app: AppSurface, path = "", hostname = currentHost()): string {
  if (!appSurface(hostname)) return `${LEGACY_BASE[app]}${path}` || "/";
  const suffix = path === "/" ? "" : path && !/^[/?#]/.test(path) ? `/${path}` : path;
  const joined = `${APP_BASE_PATHS[app]}${suffix}`;
  const target = joined.startsWith("/") ? joined : `/${joined}`;
  return normalizedHost(hostname) === APP_DOMAINS[app] ? target : `https://${APP_DOMAINS[app]}${target}`;
}

export const adminPath = (path = "", hostname = currentHost()) => appPath("admin", path, hostname);
export const petugasPath = (path = "", hostname = currentHost()) => appPath("petugas", path, hostname);
export const wargaPath = (path = "", hostname = currentHost()) => appPath("warga", path, hostname);

/** Pergantian bagian harus memuat HTML baru, termasuk petugas ↔ dashboard pada host yang sama. */
export function sameAppPath(path: string, homePath: string, hostname = currentHost()): boolean {
  if (!path.startsWith("/") || path.startsWith("//")) return false;
  const surface = appSurface(hostname, homePath.split(/[?#]/)[0]);
  if (surface) return appSurface(hostname, path.split(/[?#]/)[0]) === surface;
  const base = homePath.replace(/\/$/, "");
  return path === base || ["/", "?", "#"].some((separator) => path.startsWith(base + separator));
}

/** QR rumah dan link kode warga selalu membuka Info warga, walau dibuat dari dashboard. */
export function wargaOrigin(origin: string): string {
  return appSurface(new URL(origin).hostname) ? `https://${APP_DOMAINS.warga}${APP_BASE_PATHS.warga}` : origin.replace(/\/+$/, "");
}
