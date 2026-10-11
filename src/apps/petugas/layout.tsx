import {
  History,
  Home,
  ScanLine,
  Shield,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { matchPath, NavLink, useLocation } from "react-router";
import { cx } from "@/components/ui";
import { petugasPath } from "@/lib/app-paths";
import { useAuth } from "@/client/auth";
import { canRonda } from "@/lib/permissions";
import { ScanQr } from "./scan-qr";
import { RondaStoreProvider } from "./ronda/ronda-store-provider";

type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
} | null;

const ITEMS: NavItem[] = [
  { to: petugasPath(), label: "Beranda", icon: Home, end: true },
  { to: petugasPath("/ronda"), label: "Ronda", icon: Shield },
  null,
  { to: petugasPath("/riwayat"), label: "Riwayat", icon: History },
  { to: petugasPath("/akun"), label: "Akun", icon: UserRound },
];

/** Kerangka app warga/petugas: tampilan satu kolom dan navigasi bawah pada semua ukuran layar. */
export function PetugasLayout({ children }: { children: ReactNode }) {
  const user = useAuth().data?.user;
  const { pathname } = useLocation();
  const activeIndex = ITEMS.findIndex((item) => item && matchPath({ path: item.to, end: item.end ?? false }, pathname));
  const [scannerOpen, setScannerOpen] = useState(false);
  const scanRef = useRef<HTMLButtonElement>(null);
  const content = (
    <>
      <div className="mx-auto w-full max-w-3xl flex-1 px-4 pb-[calc(8rem+env(safe-area-inset-bottom,0px))] pt-5">
        {children}
      </div>
      <nav
        aria-label="Menu app"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card pb-[env(safe-area-inset-bottom,0px)] pl-[env(safe-area-inset-left,0px)] pr-[env(safe-area-inset-right,0px)]"
      >
        <div className="relative mx-auto max-w-lg px-2">
          <ul className="grid h-20 grid-cols-5">
            {ITEMS.map((item) => {
              if (!item)
                return (
                  <li key="scan">
                    <button
                      ref={scanRef}
                      type="button"
                      aria-label="Scan QR rumah"
                      onClick={() => setScannerOpen(true)}
                      className="group relative flex h-full w-full touch-manipulation select-none flex-col items-center rounded-2xl pt-12 text-[11px] font-semibold text-primary focus-visible:outline-2 focus-visible:outline-primary focus-visible:-outline-offset-4"
                    >
                      <span className="absolute -top-5 flex size-14 items-center justify-center rounded-full bg-primary text-primary-fg ring-[6px] ring-card shadow-[0_6px_16px_color-mix(in_srgb,var(--primary)_25%,transparent)] transition-[transform,background-color] duration-160 ease-[var(--ease-out)] group-hover:bg-primary/90 group-active:[transform:scale(0.97)] group-active:bg-primary/80 motion-reduce:group-active:transform-none min-[375px]:size-16">
                        <ScanLine
                          className="size-8"
                          strokeWidth={2}
                          aria-hidden
                        />
                      </span>
                      Scan QR
                    </button>
                  </li>
                );
              const { to, label, icon: Icon, end } = item;
              return (
                <li key={to}>
                  <NavLink
                    to={to}
                    end={end}
                    title={label}
                    className={({ isActive, isPending }) =>
                      cx(
                        "relative flex h-full touch-manipulation select-none flex-col items-center justify-center gap-1 rounded-2xl text-[11px] font-medium transition-colors hover:text-primary active:bg-primary/5 focus-visible:outline-2 focus-visible:outline-primary focus-visible:-outline-offset-4",
                        isActive || isPending ? "text-primary" : "text-muted",
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <Icon
                          className="size-6"
                          strokeWidth={isActive ? 2.4 : 1.8}
                          aria-hidden
                        />
                        {label}
                      </>
                    )}
                  </NavLink>
                </li>
              );
            })}
          </ul>
          {activeIndex >= 0 && (
            <span aria-hidden className="pointer-events-none absolute inset-x-2 bottom-2.5">
              <span
                className="app-menu-indicator flex w-1/5 justify-center transition-transform duration-200 ease-[var(--ease-in-out)] motion-reduce:transition-none"
                style={{ transform: `translateX(${activeIndex * 100}%)` }}
              >
                <span className="size-1.5 rounded-full bg-primary" />
              </span>
            </span>
          )}
        </div>
      </nav>
      {scannerOpen && (
        <ScanQr onClose={() => setScannerOpen(false)} triggerRef={scanRef} />
      )}
    </>
  );
  return user && canRonda(user.role) ? (
    <RondaStoreProvider
      key={user.id}
      userId={user.id}
      enabled={scannerOpen || pathname === petugasPath("/ronda")}
    >
      {content}
    </RondaStoreProvider>
  ) : (
    content
  );
}
