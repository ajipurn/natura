import { CalendarDays, History, ScanLine, UserRound, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { NavLink } from "react-router";
import { cx } from "@/components/ui";
import { petugasPath } from "@/lib/app-paths";

const ITEMS: { to: string; label: string; icon: LucideIcon; end?: boolean }[] = [
  { to: petugasPath(), label: "Ronda", icon: ScanLine, end: true },
  { to: petugasPath("/riwayat"), label: "Riwayat", icon: History },
  { to: petugasPath("/jadwal"), label: "Jadwal", icon: CalendarDays },
  { to: petugasPath("/akun"), label: "Akun", icon: UserRound },
];

/** Kerangka app petugas: tampilan satu kolom dan navigasi bawah pada semua ukuran layar. */
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
