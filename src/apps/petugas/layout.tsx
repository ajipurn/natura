import { CalendarDays, History, ScanLine, UserRound, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { NavLink } from "react-router";
import { cx } from "@/components/ui";

const ITEMS: { to: string; label: string; icon: LucideIcon; end?: boolean }[] = [
  { to: "/petugas", label: "Ronda", icon: ScanLine, end: true },
  { to: "/petugas/riwayat", label: "Riwayat", icon: History },
  { to: "/petugas/jadwal", label: "Jadwal", icon: CalendarDays },
  { to: "/petugas/akun", label: "Akun", icon: UserRound },
];

/** Kerangka app petugas: isi halaman + navigasi bawah (khusus HP). */
export function PetugasLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="mx-auto w-full max-w-3xl flex-1 px-4 pb-28 pt-5">{children}</div>
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <ul className="mx-auto grid max-w-3xl grid-cols-4">
          {ITEMS.map(({ to, label, icon: Icon, end }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                className={({ isActive, isPending }) =>
                  cx(
                    "flex flex-col items-center gap-0.5 py-2 text-xs font-medium",
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
