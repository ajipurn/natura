import { CalendarDays, History, ScanLine, UserRound, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { NavLink, useMatch } from "react-router";
import { cx } from "@/components/ui";

const ITEMS: { to: string; label: string; icon: LucideIcon; end?: boolean }[] = [
  { to: "/petugas", label: "Ronda", icon: ScanLine, end: true },
  { to: "/petugas/riwayat", label: "Riwayat", icon: History },
  { to: "/petugas/jadwal", label: "Jadwal", icon: CalendarDays },
  { to: "/petugas/akun", label: "Akun", icon: UserRound },
];

/** Kerangka app petugas: isi halaman + navigasi bawah (khusus HP). */
export function PetugasLayout({ children }: { children: ReactNode }) {
  // Layar Ronda dua kolom di layar lebar (ringkasan di kiri, rumah/denah di kanan).
  const wide = useMatch({ path: "/petugas", end: true });
  return (
    <>
      <div className={cx("mx-auto w-full flex-1 px-4 pb-28 pt-5", wide ? "max-w-3xl lg:max-w-6xl" : "max-w-3xl")}>{children}</div>
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <ul className="mx-auto grid max-w-3xl grid-cols-4">
          {ITEMS.map(({ to, label, icon: Icon, end }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                className={({ isActive, isPending }) =>
                  cx(
                    // Tinggi tetap (h-14): bar aksi di layar Ronda menempel tepat di atasnya.
                    "flex h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium",
                    isActive || isPending ? "text-primary" : "text-muted",
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon className="size-6" strokeWidth={isActive ? 2.4 : 1.8} aria-hidden />
                    {label}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
