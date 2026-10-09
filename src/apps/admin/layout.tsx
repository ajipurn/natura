import { useMutation, useQuery } from "@tanstack/react-query";
import {
  CalendarDays,
  History,
  Home,
  LayoutDashboard,
  LogOut,
  Map as MapIcon,
  Megaphone,
  Menu,
  ScanLine,
  Settings,
  Table2,
  Users,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { NavLink, useLocation, useNavigate } from "react-router";
import { api, call } from "@/client/api";
import { clearCache } from "@/client/query";
import { ScrollArea } from "@/components/scroll-area";
import { ThemeSwitch } from "@/components/theme-toggle";
import { Button, cx } from "@/components/ui";
import type { SessionUser } from "@/server/auth";
import { requestsQuery, settingsQuery } from "./queries";
import { adminPath, petugasPath } from "@/lib/app-paths";

type NavItem = { to: string; label: string; icon: LucideIcon; end?: boolean };

/** "Ronda" untuk memantau sehari-hari, "Kelola" untuk data yang jarang berubah. Pengaturan di bawah. */
const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: "Ronda",
    items: [
      { to: adminPath(), label: "Ringkasan", icon: LayoutDashboard, end: true },
      { to: adminPath("/denah"), label: "Peta ronda", icon: MapIcon },
      { to: adminPath("/riwayat"), label: "Riwayat", icon: History },
      { to: adminPath("/rekap"), label: "Rekap bulanan", icon: Table2 },
      { to: adminPath("/kas"), label: "Kas", icon: Wallet },
    ],
  },
  {
    group: "Kelola",
    items: [
      { to: adminPath("/jadwal"), label: "Jadwal ronda", icon: CalendarDays },
      { to: adminPath("/petugas"), label: "Petugas", icon: Users },
      { to: adminPath("/rumah"), label: "Rumah & QR", icon: Home },
      { to: adminPath("/info"), label: "Info warga", icon: Megaphone },
    ],
  },
];

const SETTINGS: NavItem = { to: adminPath("/pengaturan"), label: "Pengaturan", icon: Settings };

/** Kerangka dashboard admin: menu samping di layar lebar, menu geser di HP. */
export function AdminLayout({ user, children }: { user: SessionUser; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  // Tutup menu geser setelah pindah halaman.
  const [lastPath, setLastPath] = useState(location.pathname);
  if (lastPath !== location.pathname) {
    setLastPath(location.pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="flex min-h-full flex-1">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 border-r border-line bg-card lg:block print:hidden">
        <Sidebar user={user} />
      </aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden print:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <Button variant="plain" aria-label="Tutup menu" className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-card shadow-xl">
            <Button variant="ghost" size="icon" aria-label="Tutup menu" onClick={() => setOpen(false)} className="absolute right-2 top-3">
              <X className="size-5" />
            </Button>
            <Sidebar user={user} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-line bg-card/95 px-3 py-2 backdrop-blur lg:hidden print:hidden">
          <Button variant="ghost" size="icon" onClick={() => setOpen(true)} aria-label="Buka menu">
            <Menu className="size-6" />
          </Button>
          <span className="font-semibold">Admin Jimpitan</span>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-16 pt-5 lg:px-8 lg:pt-8 print:max-w-none print:p-0">
          {children}
        </main>
      </div>
    </div>
  );
}

function Sidebar({ user }: { user: SessionUser }) {
  const navigate = useNavigate();
  // Jumlah permintaan ubah jadwal yang menunggu, tampil di menu Jadwal ronda.
  const pendingRequests = useQuery(requestsQuery).data?.pending ?? 0;
  const logoUrl = useQuery(settingsQuery).data?.logoUrl;
  const logout = useMutation({
    mutationFn: () => call(api.auth.logout.$post()),
    onSuccess: () => {
      clearCache();
      try {
        localStorage.removeItem("jimpitan:auth");
      } catch {}
      navigate(adminPath("/masuk"), { replace: true });
    },
  });

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-5 pb-3 pt-5">
        {logoUrl && <img src={logoUrl} alt="" className="size-10 shrink-0 rounded-lg object-contain" />}
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">Jimpitan</p>
          <p className="text-lg font-bold">Admin</p>
        </div>
      </div>
      <ScrollArea element="nav" aria-label="Menu admin" className="min-h-0 flex-1 overflow-y-auto">
        <div className="px-3">
          {NAV.map(({ group, items }) => (
            <div key={group} className="mb-4">
              <p className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-muted">{group}</p>
              <ul className="space-y-1">
                {items.map((item) => (
                  <li key={item.to}>
                    <SidebarLink item={item}>
                      {item.to === adminPath("/jadwal") && pendingRequests > 0 && (
                        <span
                          className="ml-auto rounded-full bg-warn px-2 py-0.5 text-xs font-bold text-card"
                          aria-label={`${pendingRequests} permintaan ubah jadwal`}
                        >
                          {pendingRequests}
                        </span>
                      )}
                    </SidebarLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </ScrollArea>
      <div className="space-y-1 border-t border-line p-3">
        <SidebarLink item={SETTINGS} />
        <ThemeSwitch />
        <a href={petugasPath("/")} className="flex items-center gap-3 rounded-xl px-2 py-2 text-sm font-medium hover:bg-idle-soft">
          <ScanLine className="size-5 text-primary" /> Buka app petugas
        </a>
        <Button
          variant="plain"
          onClick={() => logout.mutate()}
          disabled={logout.isPending}
          className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left text-sm font-medium text-empty hover:bg-empty-soft"
        >
          <LogOut className="size-5" /> Keluar
          <span className="ml-auto truncate text-xs font-normal text-muted">{user.name}</span>
        </Button>
      </div>
    </div>
  );
}

function SidebarLink({ item: { to, label, icon: Icon, end }, children }: { item: NavItem; children?: ReactNode }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cx(
          "flex items-center gap-3 rounded-xl px-2 py-2 text-sm font-medium",
          isActive ? "bg-primary/12 text-primary" : "text-fg hover:bg-idle-soft",
        )
      }
    >
      <Icon className="size-5" /> {label}
      {children}
    </NavLink>
  );
}
