import { APP_DOMAINS, NATURA_HOSTS, appSurface } from "../src/lib/app-paths";

const SHELLS = { petugas: "/petugas/index.html", admin: "/admin/index.html", warga: "/index.html", landing: "/landing/index.html" };
const PAGE_PATTERN = "^/(?!api(?:/|$)|assets(?:/|$)|@|.*\\.[a-zA-Z0-9]+$).*$";

/** Dev dan preview memilih HTML yang sama dengan routing Vercel, tanpa membuka database. */
export function pageShell(pathname: string, hostname: string): string | null {
  if (!new RegExp(PAGE_PATTERN).test(pathname)) return null;
  const surface = appSurface(hostname);
  if (surface) return SHELLS[surface];
  if (/^\/petugas(?:\/|$)/.test(pathname)) return SHELLS.petugas;
  if (/^\/admin(?:\/|$)/.test(pathname)) return SHELLS.admin;
  if (/^\/landing(?:\/|$)/.test(pathname)) return SHELLS.landing;
  return SHELLS.warga;
}

/** Tautan lama di domain baru membuka alamat canonical; query (filter/login) ikut dibawa. */
export function domainRedirect(url: URL): string | null {
  const surface = appSurface(url.hostname);
  if (!surface) return null;
  const legacy = url.pathname.match(/^\/(petugas|admin)(?:\/(.*))?$/);
  let target: string | undefined;
  // /petugas di dashboard adalah pengelolaan akun, bukan alamat app petugas lama.
  if (legacy && !(surface === "admin" && legacy[1] === "petugas")) {
    target = `https://${APP_DOMAINS[legacy[1] as "petugas" | "admin"]}/${legacy[2] ?? ""}`;
  }
  else if (surface !== "warga" && url.pathname.startsWith("/r/")) target = `https://${APP_DOMAINS.warga}${url.pathname}`;
  if (!target) return null;
  return target + url.search;
}

/** Build Output API v3: host diperiksa sebelum filesystem agar / memilih app yang tepat. */
export const vercelRoutes = [
  { src: "^/assets/.*$", headers: { "cache-control": "public, max-age=31536000, immutable" }, continue: true },
  { src: "^/api(?:/.*)?$", dest: "/api" },
  ...NATURA_HOSTS.flatMap((hostname) => [
    ...(["petugas", "admin"] as const).filter((app) => !(hostname === APP_DOMAINS.admin && app === "petugas")).map((app) => ({
      src: `^/${app}(?:/(.*))?$`,
      has: [{ type: "host", value: hostname }],
      status: 308,
      headers: { Location: `https://${APP_DOMAINS[app]}/$1` },
    })),
    ...(hostname === APP_DOMAINS.warga ? [] : [{
      src: "^/r/(.*)$",
      has: [{ type: "host", value: hostname }],
      status: 308,
      headers: { Location: `https://${APP_DOMAINS.warga}/r/$1` },
    }]),
  ]),
  ...NATURA_HOSTS.map((hostname) => ({
    src: PAGE_PATTERN,
    has: [{ type: "host", value: hostname }],
    dest: SHELLS[appSurface(hostname)!],
  })),
  { handle: "filesystem" },
  { src: "^/petugas(?:/.*)?$", dest: SHELLS.petugas },
  { src: "^/admin(?:/.*)?$", dest: SHELLS.admin },
  { src: "^/landing(?:/.*)?$", dest: SHELLS.landing },
  { src: PAGE_PATTERN, dest: SHELLS.warga },
];

/** Manifest khusus subdomain: app dimulai di / dan mencakup seluruh subdomain. */
export const DOMAIN_MANIFESTS = [
  { source: "petugas.webmanifest", target: "petugas-domain.webmanifest", name: "Cluster Natura · Petugas", shortName: "Natura" },
  { source: "admin.webmanifest", target: "admin-domain.webmanifest", name: "Cluster Natura · Dashboard", shortName: "Natura Admin" },
];
