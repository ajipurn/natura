import { APP_BASE_PATHS, APP_DOMAINS, COMMUNITY_DOMAIN, LEGACY_APP_DOMAINS, NATURA_HOSTS, appSurface, type AppSurface } from "../src/lib/app-paths";

const SHELLS = { petugas: "/petugas/index.html", admin: "/admin/index.html", warga: "/index.html", landing: "/landing/index.html" };
const PAGE_PATTERN = "^/(?!api(?:/|$)|assets(?:/|$)|@|.*\\.[a-zA-Z0-9]+$)(.*)$";

/** Dev dan preview memilih HTML yang sama dengan routing Vercel, tanpa membuka database. */
export function pageShell(pathname: string, hostname: string): string | null {
  if (!new RegExp(PAGE_PATTERN).test(pathname)) return null;
  const surface = appSurface(hostname, pathname);
  if (surface) return SHELLS[surface];
  if (/^\/(?:app|petugas)(?:\/|$)/.test(pathname)) return SHELLS.petugas;
  if (/^\/admin(?:\/|$)/.test(pathname)) return SHELLS.admin;
  if (/^\/landing(?:\/|$)/.test(pathname)) return SHELLS.landing;
  return SHELLS.warga;
}

function movePrefix(prefix: string, app: AppSurface) {
  const base = `https://${APP_DOMAINS[app]}${APP_BASE_PATHS[app]}`;
  return [
    { src: `^${prefix}/?$`, destination: base + (APP_BASE_PATHS[app] ? "" : "/") },
    { src: `^${prefix}/(?!.*\\.[a-zA-Z0-9]+$)(.+)$`, destination: `${base}/$1` },
  ];
}

// Satu daftar redirect untuk Vite dan Vercel; halaman pengelolaan akun di dashboard lama tetap /dashboard/petugas.
const DOMAIN_REDIRECTS = NATURA_HOSTS.flatMap((hostname) => {
  const oldDashboard = hostname === LEGACY_APP_DOMAINS.admin;
  const appHome = `https://${APP_DOMAINS.petugas}/`;
  const redirects = [
    ...movePrefix("/admin", "admin"),
    ...(oldDashboard ? [] : [{ src: "^/(?:app|petugas)/info/?$", destination: appHome }]),
    ...(oldDashboard ? [] : movePrefix("/petugas", "petugas")),
    ...(oldDashboard ? [] : movePrefix("/app", "petugas")),
    ...(hostname === APP_DOMAINS.admin ? [] : movePrefix("/dashboard", "admin")),
    ...(oldDashboard ? [] : [
      { src: "^/info/?$", destination: appHome },
      ...(hostname === COMMUNITY_DOMAIN || hostname === `www.${COMMUNITY_DOMAIN}` ? [] : [{ src: "^/info/(?!.*\\.[a-zA-Z0-9]+$)(.+)$", destination: `https://${APP_DOMAINS.warga}${APP_BASE_PATHS.warga}/$1` }]),
    ]),
    { src: "^/r/(.*)$", destination: `https://${APP_DOMAINS.warga}${APP_BASE_PATHS.warga}/r/$1` },
  ];
  if (oldDashboard || hostname === LEGACY_APP_DOMAINS.warga) {
    const app = oldDashboard ? "admin" : "warga";
    const base = `https://${APP_DOMAINS[app]}${APP_BASE_PATHS[app]}`;
    redirects.push({ src: "^/$", destination: oldDashboard ? base : appHome }, { src: PAGE_PATTERN, destination: `${base}/$1` });
  }
  return redirects.map((rule) => ({ ...rule, hostname }));
});

const LOCAL_REDIRECTS = [
  { src: "^/petugas/?$", destination: "/app" },
  { src: "^/petugas/(?!.*\\.[a-zA-Z0-9]+$)(.+)$", destination: "/app/$1" },
  { src: "^/info/?$", destination: "/app" },
];

/** Tautan lama membuka alamat canonical; query (filter/login) dan fragmen ikut dibawa. */
export function domainRedirect(url: URL): string | null {
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  for (const rule of DOMAIN_REDIRECTS) {
    if (rule.hostname !== hostname) continue;
    const match = url.pathname.match(new RegExp(rule.src));
    if (match) return rule.destination.replace(/\$(\d+)/g, (_, group) => match[Number(group)] ?? "") + url.search + url.hash;
  }
  if (!NATURA_HOSTS.includes(hostname)) {
    for (const rule of LOCAL_REDIRECTS) {
      const match = url.pathname.match(new RegExp(rule.src));
      if (match) return rule.destination.replace(/\$(\d+)/g, (_, group) => match[Number(group)] ?? "") + url.search + url.hash;
    }
  }
  return null;
}

const under = (base: string) => `^(?=${base}(?:/|$))${PAGE_PATTERN.slice(1)}`;

/** Build Output API v3: host diperiksa sebelum filesystem agar / memilih app yang tepat. */
export const vercelRoutes = [
  { src: "^/assets/.*$", headers: { "cache-control": "public, max-age=31536000, immutable" }, continue: true },
  { src: "^/api(?:/.*)?$", dest: "/api" },
  // Manifest di HTML awal harus benar sebelum JavaScript mengganti href-nya.
  { src: "^/petugas\\.webmanifest$", has: [{ type: "host", value: APP_DOMAINS.petugas }], dest: "/petugas-domain.webmanifest" },
  { src: "^/admin\\.webmanifest$", has: [{ type: "host", value: APP_DOMAINS.admin }], dest: "/admin-domain.webmanifest" },
  ...DOMAIN_REDIRECTS.map(({ hostname, src, destination }) => ({
    src, has: [{ type: "host", value: hostname }], status: 308, headers: { Location: destination },
  })),
  { src: under(APP_BASE_PATHS.admin), has: [{ type: "host", value: APP_DOMAINS.admin }], dest: SHELLS.admin },
  ...[COMMUNITY_DOMAIN, `www.${COMMUNITY_DOMAIN}`].map((hostname) => ({
    src: under(APP_BASE_PATHS.warga), has: [{ type: "host", value: hostname }], dest: SHELLS.warga,
  })),
  ...NATURA_HOSTS.map((hostname) => ({
    src: PAGE_PATTERN,
    has: [{ type: "host", value: hostname }],
    dest: SHELLS[appSurface(hostname)!],
  })),
  ...LOCAL_REDIRECTS.map(({ src, destination }) => ({ src, status: 308, headers: { Location: destination } })),
  { handle: "filesystem" },
  { src: "^/app(?:/.*)?$", dest: SHELLS.petugas },
  { src: "^/petugas(?:/.*)?$", dest: SHELLS.petugas },
  { src: "^/admin(?:/.*)?$", dest: SHELLS.admin },
  { src: "^/landing(?:/.*)?$", dest: SHELLS.landing },
  { src: PAGE_PATTERN, dest: SHELLS.warga },
];

/** Manifest production memakai alamat awal dan cakupan masing-masing bagian. */
export const DOMAIN_MANIFESTS = [
  { source: "petugas.webmanifest", target: "petugas-domain.webmanifest", name: "Cluster Natura", shortName: "Natura", id: "/", basePath: "/" },
  { source: "admin.webmanifest", target: "admin-domain.webmanifest", name: "Cluster Natura · Dashboard", shortName: "Natura Admin", id: "/dashboard/", basePath: "/dashboard/" },
];
