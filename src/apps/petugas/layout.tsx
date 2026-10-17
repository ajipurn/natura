import {
  History,
  Home,
  ScanLine,
  Shield,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { matchPath, NavLink, useLocation } from "react-router";
import { cx } from "@/components/ui";
import { petugasPath } from "@/lib/app-paths";
import { useAuth } from "@/client/auth";
import { canRonda } from "@/lib/permissions";
import { createScanFeedback, type ScanFeedback } from "@/lib/scan-feedback";
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
  const [scanFeedback, setScanFeedback] = useState<ScanFeedback | null>(null);
  const scannerOpen = scanFeedback !== null;
  useEffect(() => () => scanFeedback?.dispose(), [scanFeedback]);
  const scanRef = useRef<HTMLButtonElement>(null);
  const content = (
    <div className="mobile-app flex min-h-dvh flex-1 flex-col">
      <a href="#app-content" className="sr-only z-50 rounded-xl bg-card p-3 font-semibold text-primary focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:outline-2 focus:outline-primary">
        Langsung ke isi
      </a>
      <div id="app-content" tabIndex={-1} className="mx-auto w-full max-w-2xl flex-1 px-5 pb-[calc(8rem+env(safe-area-inset-bottom,0px))] pt-[max(1.5rem,env(safe-area-inset-top,0px))] focus:outline-none sm:px-6 sm:pt-8">
        {children}
      </div>
      <nav
        aria-label="Menu app"
        className="fixed inset-x-0 bottom-0 z-30 px-[max(0.75rem,env(safe-area-inset-left,0px))] pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] pe-[max(0.75rem,env(safe-area-inset-right,0px))]"
      >
        <div className="relative mx-auto max-w-lg rounded-[1.75rem] bg-card/95 px-2 shadow-[0_8px_40px_-8px_#0f172a30,0_0_0_1px_color-mix(in_srgb,var(--line)_75%,transparent)] backdrop-blur-xl">
          <ul className="grid min-h-20 grid-cols-5">
            {ITEMS.map((item) => {
              if (!item)
                return (
                  <li key="scan">
                    <button
                      ref={scanRef}
                      type="button"
                      aria-label="Scan QR rumah"
                      onClick={() => setScanFeedback(createScanFeedback())}
                      className="group relative flex h-full min-h-20 w-full touch-manipulation select-none flex-col items-center rounded-2xl pb-3 pt-12 text-xs font-semibold text-primary focus-visible:outline-2 focus-visible:outline-primary focus-visible:-outline-offset-4"
                    >
                      <span className="absolute -top-3 flex size-14 items-center justify-center rounded-[1.25rem] bg-primary text-primary-fg ring-[5px] ring-card shadow-[0_6px_16px_color-mix(in_srgb,var(--primary)_25%,transparent)] transition-[scale,background-color] duration-150 ease-out group-hover:bg-primary/90 group-active:scale-[0.96] group-active:bg-primary/80 motion-reduce:transition-none motion-reduce:group-active:scale-100">
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
                        "group relative flex h-full min-h-20 touch-manipulation select-none flex-col items-center justify-center gap-0.5 rounded-2xl pb-2 pt-2 text-xs font-medium transition-colors hover:text-primary active:bg-primary/5 focus-visible:outline-2 focus-visible:outline-primary focus-visible:-outline-offset-4",
                        isActive || isPending ? "text-primary" : "text-muted",
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <span className={cx("flex h-8 w-12 items-center justify-center rounded-xl transition-colors motion-reduce:transition-none", isActive && "bg-primary/10")}>
                          <Icon className="size-5" strokeWidth={isActive ? 2.2 : 1.8} aria-hidden />
                        </span>
                        {label}
                      </>
                    )}
                  </NavLink>
                </li>
              );
            })}
          </ul>
          {activeIndex >= 0 && (
            <span aria-hidden className="pointer-events-none absolute inset-x-2 bottom-1.5">
              <span
                className="app-menu-indicator flex w-1/5 justify-center transition-transform duration-200 ease-[var(--ease-in-out)] motion-reduce:transition-none"
                style={{ transform: `translateX(${activeIndex * 100}%)` }}
              >
                <span className="h-1 w-3 rounded-full bg-primary" />
              </span>
            </span>
          )}
        </div>
      </nav>
      {scanFeedback && (
        <ScanQr onClose={() => setScanFeedback(null)} triggerRef={scanRef} feedback={scanFeedback} />
      )}
    </div>
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
